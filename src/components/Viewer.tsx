import { useEffect, useRef } from 'react'
import * as THREE from 'three'
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js'
import { trimNumber } from '@/geometry/outline'
import { cn } from '@/lib/utils'
import type { MeshData } from '@/worker/protocol'

const FIELD_OF_VIEW = 38

/**
 * What the camera frames, in millimetres. The default base is a 32 and the round
 * range is mostly 25 to 65, so framing for the largest size left the common one
 * a speck. Anything past about 100mm runs wider than the frame, which is the
 * viewer's scroll wheel to fix.
 */
const REFERENCE_FOOTPRINT = 50

/**
 * Distance at which the reference footprint fits the *narrower* axis. A phone
 * held upright has far less horizontal coverage than vertical — the field of
 * view is vertical — so fitting the height alone put a 60mm base at twice the
 * width of the screen.
 */
function framingDistance(aspect: number): number {
  const halfHeight = Math.tan(THREE.MathUtils.degToRad(FIELD_OF_VIEW / 2))
  return ((REFERENCE_FOOTPRINT / 2) * 1.45) / Math.min(halfHeight, halfHeight * aspect)
}

/** Steep enough to look down into the well, where the marking and bracing are. */
const VIEW_DIRECTION = new THREE.Vector3(0.39, -0.54, 0.74)

const CORNERS = [
  'top-0 left-0 border-t border-l',
  'top-0 right-0 border-t border-r',
  'bottom-0 left-0 border-b border-l',
  'bottom-0 right-0 border-b border-r',
]

/** Far enough that the ortho shadow frustum brackets even a 180mm base. */
const SHADOW_DISTANCE = 300

const swatch = document.createElement('canvas').getContext('2d', { willReadFrequently: true })

/**
 * Single-sources the palette: the scene reads the same tokens as the chrome.
 * three.js parses no colour space beyond sRGB and only warns when it meets one,
 * so the tokens go through a one-pixel canvas — reading the pixel back is the
 * conversion, since `fillStyle` hands an oklch string straight back. Assigning an
 * unparseable colour is a no-op, which leaves the fallback painted.
 */
function themeColor(name: string, fallback: string): THREE.Color {
  const value = getComputedStyle(document.documentElement).getPropertyValue(name).trim()
  if (!swatch) return new THREE.Color(fallback)
  swatch.fillStyle = fallback
  swatch.fillStyle = value
  swatch.fillRect(0, 0, 1, 1)
  const [r, g, b] = swatch.getImageData(0, 0, 1, 1).data
  return new THREE.Color().setRGB(r / 255, g / 255, b / 255, THREE.SRGBColorSpace)
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
  const shadowLight = useRef<THREE.DirectionalLight>(null)
  const shadowsDirty = useRef<THREE.WebGLRenderer>(null)

  useEffect(() => {
    const container = host.current
    if (!container) return

    // Transparent so the paper and its printed grid show through from CSS.
    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true })
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
    renderer.shadowMap.enabled = true
    renderer.shadowMap.type = THREE.PCFShadowMap
    // Both the light and the part are fixed; only the camera moves. Redrawing the
    // shadow map every frame cost more than the scene itself, so it is redrawn
    // once per geometry swap instead.
    renderer.shadowMap.autoUpdate = false
    shadowsDirty.current = renderer
    container.append(renderer.domElement)

    const world = new THREE.Scene()

    const camera = new THREE.PerspectiveCamera(FIELD_OF_VIEW, 1, 0.5, 2000)
    camera.up.set(0, 0, 1)
    camera.position.copy(VIEW_DIRECTION.clone().normalize())

    /*
     * Orbit, which pins the up axis: the horizon stays level and a drag always
     * means the same thing. A trackball let the same axis roll over and over,
     * but tumbling the part with no fixed horizon made it hard to tell which way
     * up anything was. The polar angle is left unclamped, so the print surface
     * underneath is still reachable — it just stops at the pole rather than
     * carrying on over the top.
     */
    const controls = new OrbitControls(camera, renderer.domElement)
    controls.enableDamping = true
    controls.dampingFactor = 0.08
    controls.target.set(0, 0, 2)

    world.add(new THREE.HemisphereLight(0xdfeaf4, 0x14293f, 0.85))

    /*
     * The key sits at ~45° and casts shadows. Everything that matters here —
     * the marking, the ribs, the bosses — is a shallow step off a flat floor,
     * so from a plan view the emboss and the floor it sits on share a normal
     * and shade identically; lit from overhead the number disappears. Any
     * off-vertical light gives each step a cast shadow instead, which reads
     * from any angle, and 45° is enough without throwing the well wall halfway
     * across a small base.
     */
    const key = new THREE.DirectionalLight(0xffffff, 2.1)
    key.position.copy(new THREE.Vector3(-0.42, -0.57, 0.71).normalize().multiplyScalar(SHADOW_DISTANCE))
    key.castShadow = true
    key.shadow.mapSize.set(2048, 2048)
    key.shadow.camera.near = SHADOW_DISTANCE / 2
    key.shadow.camera.far = SHADOW_DISTANCE * 2
    // In millimetres, and the relief is 0.6mm: any more and the marking's own
    // shadow lifts off the letters it belongs to.
    key.shadow.normalBias = 0.03
    world.add(key)
    shadowLight.current = key

    const fill = new THREE.DirectionalLight(0x8fb4d0, 0.4)
    fill.position.set(50, 30, 14)
    world.add(fill)

    // Orbiting under the part is allowed, and the sky-to-ground hemisphere leaves
    // downward faces almost black. A weak bounce keeps the print surface readable.
    const bounce = new THREE.DirectionalLight(0x9fb8cf, 0.5)
    bounce.position.set(24, 40, -60)
    world.add(bounce)

    const group = new THREE.Group()
    part.current = group
    world.add(group)

    // Until the viewer touches the camera it stays framed on the reference
    // footprint, which is what makes a window resize or a phone rotating do the
    // sensible thing. After that the view is theirs and nothing moves it.
    let held = false
    controls.addEventListener('start', () => {
      held = true
    })

    const resize = () => {
      const { clientWidth: w, clientHeight: h } = container
      renderer.setSize(w, h)
      camera.aspect = w / Math.max(h, 1)
      camera.updateProjectionMatrix()
      if (!held) camera.position.setLength(framingDistance(camera.aspect))
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
      new THREE.MeshStandardMaterial({ color: themeColor('--part', '#cbc6bb'), roughness: 0.85, metalness: 0, flatShading: true }),
    )
    // The part is the only thing in the scene, so it shadows itself: the well
    // wall onto the floor, the marking and the bosses onto the floor under them.
    solid.castShadow = true
    solid.receiveShadow = true
    group.add(solid)

    // Fit the shadow frustum to the part so a 25mm base gets the same texel
    // density as a 180mm one — the marking is smallest exactly where the base is.
    const light = shadowLight.current
    if (light) {
      const reach = Math.max(width, length) * 0.75
      Object.assign(light.shadow.camera, { left: -reach, right: reach, top: reach, bottom: -reach })
      light.shadow.camera.updateProjectionMatrix()
    }
    if (shadowsDirty.current) shadowsDirty.current.shadowMap.needsUpdate = true

    // Ink edges are what make it read as a drawn part rather than a render.
    const edges = new THREE.LineSegments(
      new THREE.EdgesGeometry(geometry, 32),
      new THREE.LineBasicMaterial({ color: themeColor('--measure', '#7fd0f0'), transparent: true, opacity: 0.3 }),
    )
    group.add(edges)

    group.userData = { halfWidth: width / 2, halfLength: length / 2, height }

    // The triangle count of what is actually in the scene, which is the only
    // honest signal that a rebuild has landed — the status word reads "ready"
    // from the build before the one being waited on. The e2e suite polls it.
    if (host.current) host.current.dataset.triangles = String(mesh.indices.length / 3)
  }, [mesh, width, length, height])

  const across = round ? `Ø${trimNumber(width)}` : `${trimNumber(width)} × ${trimNumber(length)}`

  return (
    <div className="relative h-full w-full">
      <div ref={host} className="sheet h-full w-full" />
      {/* Registration marks rather than a frame: the sheet is trimmed to size. */}
      <div className="pointer-events-none absolute inset-5" aria-hidden>
        {CORNERS.map((corner) => (
          <span key={corner} className={cn('absolute size-5 border-measure/45', corner)} />
        ))}
      </div>
      <svg ref={overlay} className="pointer-events-none absolute inset-0 h-full w-full">
        <defs>
          <marker id="tick" markerWidth="6" markerHeight="6" refX="3" refY="3" orient="auto">
            <path d="M 3 0 L 3 6" stroke="var(--measure)" strokeWidth="1" />
          </marker>
        </defs>
        <path id="ext-across" stroke="var(--measure)" strokeWidth="1" strokeOpacity="0.28" fill="none" />
        <path id="ext-height" stroke="var(--measure)" strokeWidth="1" strokeOpacity="0.28" fill="none" />
        <path
          id="dim-across"
          stroke="var(--measure)"
          strokeWidth="1"
          strokeOpacity="0.7"
          fill="none"
          markerStart="url(#tick)"
          markerEnd="url(#tick)"
        />
        <path
          id="dim-height"
          stroke="var(--measure)"
          strokeWidth="1"
          strokeOpacity="0.7"
          fill="none"
          markerStart="url(#tick)"
          markerEnd="url(#tick)"
        />
        {/* The ink stroke knocks the dimension text out of whatever sits behind it. */}
        <text
          id="label-across"
          fill="var(--measure)"
          stroke="var(--card)"
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
          fill="var(--measure)"
          stroke="var(--card)"
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
