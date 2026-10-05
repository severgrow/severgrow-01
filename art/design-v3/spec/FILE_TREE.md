# Intended V3 file tree

Development pack:
```
masters/
  textures/
  masks/
    pointy/
    flat/
  props/
    forest/
    volcano/
    rock/
  homes/
  network/
  states/
  fx/

hi/
  textures/
  masks/
    pointy/
    flat/
  props/
  homes/
  network/
  states/
  fx/

lo/
  textures/
  masks/
    pointy/
    flat/
  props/
  homes/
  network/
  states/
  fx/

geometry/
reference/
docs/
  style_frames/
  repeat_proofs/
qa/
developer_handoff/
manifest.json
```

The same runtime asset must use the same relative path and semantic anchor in `hi/` and `lo/`.

Only resolution differs.
