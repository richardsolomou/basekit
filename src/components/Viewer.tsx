import { useEffect, useRef } from 'react'
import * as THREE from 'three'
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js'
import { trimNumber } from '@/geometry/outline'
import type { MeshData } from '@/worker/protocol'

const INK = 0x0e1418
const BONE = 0xd8d4cc
const MEASURE = 0x57d6e3

/** A 1mm grid with every tenth line brought forward, like squared drafting film. */
function buildGrid(extent: number) {
  const group = new THREE.Group()
  const minor = new THREE.GridHelper(extent, extent, 0x1d2731, 0x1d2731)
  const major = new THREE.GridHelper(extent, extent / 10, 0x2f3f4c, 0x2f3f4c)
  for (const grid of [minor, major]) {
    grid.rotation.x = Math.PI / 2
    grid.position.z = -0.01
    group.add(grid)
  }
  return group
}

interface Props {
  mesh?: MeshData
  width: number
  length: number
  height: number
  round: boolean
}

export function Viewer({ mesh, width, length, height, round }: Props) {
  const host = useRef<HTMLDivElement>(null)
  const overlay = useRef<SVGSVGElement>(null)
  const part = useRef<THREE.Group>(null)
  const view = useRef<{ camera: THREE.PerspectiveCamera; controls: OrbitControls }>(null)

  useEffect(() => {
    const container = host.current
    if (!container) return

    const renderer = new THREE.WebGLRenderer({ antialias: true })
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
    container.append(renderer.domElement)

    const world = new THREE.Scene()
    world.background = new THREE.Color(INK)

    const camera = new THREE.PerspectiveCamera(38, 1, 0.5, 2000)
    camera.up.set(0, 0, 1)
    camera.position.set(40, -55, 35) // replaced by the framing effect; keeps frame one valid

    const controls = new OrbitControls(camera, renderer.domElement)
    controls.enableDamping = true
    controls.dampingFactor = 0.08
    controls.maxPolarAngle = Math.PI / 2
    view.current = { camera, controls }

    world.add(new THREE.HemisphereLight(0xdfe7ee, 0x141c24, 1.5))
    const key = new THREE.DirectionalLight(0xffffff, 1.9)
    key.position.set(-30, -46, 70)
    world.add(key)
    const fill = new THREE.DirectionalLight(0x9fb4c4, 0.5)
    fill.position.set(50, 30, 10)
    world.add(fill)

    const group = new THREE.Group()
    part.current = group
    world.add(group)

    const resize = () => {
      const { clientWidth: w, clientHeight: h } = container
      renderer.setSize(w, h)
      camera.aspect = w / Math.max(h, 1)
      camera.updateProjectionMatrix()
    }
    resize()
    const observer = new ResizeObserver(resize)
    observer.observe(container)

    // Dimension leaders are redrawn from projected anchors each frame rather than
    // through React state, so orbiting stays at frame rate.
    const RIM_SAMPLES = 96
    const rim = Array.from({ length: RIM_SAMPLES }, (_, i) => {
      const a = (2 * Math.PI * i) / RIM_SAMPLES
      return { cos: Math.cos(a), sin: Math.sin(a) }
    })
    const scratch = new THREE.Vector3()
    const project = (x: number, y: number, z: number) => {
      scratch.set(x, y, z).project(camera)
      return [((scratch.x + 1) / 2) * container.clientWidth, ((1 - scratch.y) / 2) * container.clientHeight] as const
    }

    let raf = 0
    const tick = () => {
      controls.update()
      renderer.render(world, camera)

      const svg = overlay.current
      const halfW = group.userData.halfWidth ?? 0
      const halfL = group.userData.halfLength ?? 0
      const h = group.userData.height ?? 0
      if (svg && halfW > 0) {
        // Dimensions hang off the projected silhouette, so they stay outside the part
        // and stay horizontal or vertical at any orbit, the way a drawing does it.
        const LIFT = 30
        const OUT = 34
        let left = Infinity
        let right = -Infinity
        let top = Infinity
        let rightAngle = rim[0]
        for (const point of rim) {
          const [x, y] = project(halfW * point.cos, halfL * point.sin, h)
          if (x < left) left = x
          if (x > right) {
            right = x
            rightAngle = point
          }
          if (y < top) top = y
        }
        const rail = top - LIFT
        const [, bottomY] = project(halfW * rightAngle.cos, halfL * rightAngle.sin, 0)
        const [, topY] = project(halfW * rightAngle.cos, halfL * rightAngle.sin, h)
        const column = right + OUT

        const set = (id: string, d: string) => svg.querySelector(`#${id}`)?.setAttribute('d', d)
        set('ext-across', `M ${left} ${top} L ${left} ${rail} M ${right} ${top} L ${right} ${rail}`)
        set('dim-across', `M ${left} ${rail} L ${right} ${rail}`)
        set('ext-height', `M ${right} ${bottomY} L ${column + 6} ${bottomY} M ${right} ${topY} L ${column + 6} ${topY}`)
        set('dim-height', `M ${column} ${bottomY} L ${column} ${topY}`)

        const place = (id: string, x: number, y: number) => {
          const node = svg.querySelector<SVGTextElement>(`#${id}`)
          node?.setAttribute('x', String(x))
          node?.setAttribute('y', String(y))
        }
        place('label-across', (left + right) / 2, rail - 8)
        place('label-height', column + 10, (bottomY + topY) / 2 + 4)
      }
      raf = requestAnimationFrame(tick)
    }
    tick()

    return () => {
      cancelAnimationFrame(raf)
      observer.disconnect()
      controls.dispose()
      renderer.dispose()
      renderer.domElement.remove()
    }
  }, [])

  // Re-frame only when the footprint changes, so tweaking other settings never
  // yanks the camera away from wherever it has been orbited to.
  useEffect(() => {
    if (!view.current) return
    const { camera, controls } = view.current
    const span = Math.max(width, length)
    const distance = (span / 2 / Math.sin(THREE.MathUtils.degToRad(camera.fov / 2))) * 1.45
    camera.position.copy(new THREE.Vector3(0.52, -0.72, 0.46).normalize().multiplyScalar(distance))
    controls.target.set(0, 0, height / 2)
    controls.update()
  }, [width, length, height])

  // Swap in new geometry, keeping the camera where it was.
  useEffect(() => {
    const group = part.current
    if (!group || !mesh) return

    while (group.children.length > 0) {
      const child = group.children[0]
      group.remove(child)
      if (child instanceof THREE.Mesh || child instanceof THREE.LineSegments) child.geometry.dispose()
    }

    const geometry = new THREE.BufferGeometry()
    geometry.setAttribute('position', new THREE.BufferAttribute(mesh.positions, 3))
    geometry.setIndex(new THREE.BufferAttribute(mesh.indices, 1))

    // Manifold shares vertices across hard edges, so averaged normals would round
    // off the wall and flatten the embossed number. Flat shading keeps them crisp.
    const solid = new THREE.Mesh(
      geometry,
      new THREE.MeshStandardMaterial({ color: BONE, roughness: 0.75, metalness: 0.02, flatShading: true }),
    )
    group.add(solid)

    // A sparse edge pass reads as a drawn part instead of a rendered blob.
    const edges = new THREE.LineSegments(
      new THREE.EdgesGeometry(geometry, 32),
      new THREE.LineBasicMaterial({ color: MEASURE, transparent: true, opacity: 0.22 }),
    )
    group.add(edges)

    group.add(buildGrid(Math.max(60, Math.ceil(Math.max(width, length) / 10) * 10 + 20)))
    group.userData = { halfWidth: width / 2, halfLength: length / 2, height }
  }, [mesh, width, length, height])

  const across = round ? `Ø${trimNumber(width)}` : `${trimNumber(width)} × ${trimNumber(length)}`

  return (
    <div className="relative h-full w-full">
      <div ref={host} className="h-full w-full" />
      <svg ref={overlay} className="pointer-events-none absolute inset-0 h-full w-full">
        <defs>
          <marker id="tick" markerWidth="6" markerHeight="6" refX="3" refY="3" orient="auto">
            <path d="M 3 0 L 3 6" stroke="#57d6e3" strokeWidth="1" />
          </marker>
        </defs>
        <path id="ext-across" stroke="#57d6e3" strokeWidth="1" strokeOpacity="0.28" fill="none" />
        <path id="ext-height" stroke="#57d6e3" strokeWidth="1" strokeOpacity="0.28" fill="none" />
        <path
          id="dim-across"
          stroke="#57d6e3"
          strokeWidth="1"
          strokeOpacity="0.7"
          fill="none"
          markerStart="url(#tick)"
          markerEnd="url(#tick)"
        />
        <path
          id="dim-height"
          stroke="#57d6e3"
          strokeWidth="1"
          strokeOpacity="0.7"
          fill="none"
          markerStart="url(#tick)"
          markerEnd="url(#tick)"
        />
        {/* The ink stroke knocks the dimension text out of whatever sits behind it. */}
        <text
          id="label-across"
          fill="#57d6e3"
          stroke="#0e1418"
          strokeWidth="4"
          paintOrder="stroke"
          fontSize="12"
          fontFamily="IBM Plex Mono, monospace"
          textAnchor="middle"
        >
          {across}
        </text>
        <text
          id="label-height"
          fill="#57d6e3"
          stroke="#0e1418"
          strokeWidth="4"
          paintOrder="stroke"
          fontSize="12"
          fontFamily="IBM Plex Mono, monospace"
        >
          {trimNumber(height)}
        </text>
      </svg>
    </div>
  )
}
