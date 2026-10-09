# basekit

## 0.15.0

### Minor Changes

- b8b28be: Remove the base adapter generator. Rebasing a miniature is simpler with a new base of the right size, so the Adapters page is gone. Old adapter links and bookmarks open on bases, and saved settings for every other generator carry over.

## 0.14.1

### Patch Changes

- 0f2dc36: Keep every dimension field on values its input accepts, so defaults such as the movement tray rim and spray tray spacing no longer read as invalid and arrow keys step to round figures.

## 0.14.0

### Minor Changes

- 31f5ddf: Add a Copy link button that shares the current generator's settings in the address, with no server involved.

## 0.13.0

### Minor Changes

- 6da438d: Add base adapters that seat an old base in a recess inside a new footprint, with optional magnet pockets in the underside.

## 0.12.0

### Minor Changes

- c8e031c: Add rank-and-file movement trays with base slots and magnet pockets that match magnetised bases.

## 0.11.0

### Minor Changes

- abe2ec8: Add square and hex tokens, sized across their flats, with text and images fitted to each shape's face.

## 0.10.0

### Minor Changes

- 9d18a64: Export several base sizes at once, with quantities, as an STL archive or a multi-plate 3MF.

## 0.9.0

### Minor Changes

- 0dfe417: Add a confirmed reset for each generator's settings and for the shared magnet settings, so a bad saved configuration no longer sticks.

## 0.8.0

### Minor Changes

- a4c23b0: Show an approximate solid-PLA filament weight for every generator in the title block, totalled across holder modules and the spray tray with its handle.

## 0.7.0

### Minor Changes

- a1b0474: Emboss custom base label text, such as a unit name or squad number, and report text that does not fit instead of dropping it.

## 0.6.0

### Minor Changes

- f668c4a: Show how many more of each holder miniature size fit in the modules already planned.

## 0.5.1

### Patch Changes

- eb8330e: Fill raised text solidly where neighbouring glyphs overlap, such as accented letters, instead of leaving gaps in tokens, base labels and holder engravings.
- bfc0b01: Stop the 3D viewer redrawing while nothing changes, and keep a drag's momentum from carrying into the next generator's view.

## 0.5.0

### Minor Changes

- 730f0f5: Add round gaming tokens with wrapped text and uploaded images traced into raised, support-free silhouettes.

## 0.4.0

### Minor Changes

- ccc6720: Add low-profile magnetic spray trays with interleaved pocket grids, configurable glue-on handles, and engraved centre marks for batch priming mixed miniature sizes.

## 0.3.0

### Minor Changes

- 8ab0a9c: Add printable, configurable flying stems with flat feet and peg or ball-joint miniature connections.

## 0.2.0

### Minor Changes

- 7370713: Add configurable holder-edge spacing with a default of half the miniature spacing.

## 0.1.4

### Patch Changes

- 8227229: Keep the 3D viewer responsive without browser resize warnings.

## 0.1.3

### Patch Changes

- 1dc6d85: Increase the default top thickness of bases 65mm and larger to 1.5mm, and add magnet depth clearance for a more reliable fit.

## 0.1.2

### Patch Changes

- 3312116: Use shared PostHog defaults for analytics, replay, feature flags, and error tracking.

## 0.1.1

### Patch Changes

- f153047: Adopt automated versioned releases for BaseKit.
