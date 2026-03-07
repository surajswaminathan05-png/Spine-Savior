# Spine Savior — 3D Printed Enclosures

## Files

| File | For | Board Size | Interior (mm) | Print Qty |
|------|-----|-----------|---------------|-----------|
| `central_hub_3.5x2in.scad` | Arduino + Multiplexer | 3.5" × 2" | 91 × 53 × **25*** | 1 |
| `sensor_2x1.5in.scad` | Adafruit sensors | 2" × 1.5" | 53 × 40 × **20*** | **2** |
| `sensor_1.4x1.5in.scad` | Smaller Adafruit sensor | 1.4" × 1.5" | 38 × 40 × **20*** | 1 |

> **\*Height (Z) is a placeholder.** Measure the tallest component on each board and add 5mm, then update `interior_z` in each `.scad` file.

## How to Use

1. Download **OpenSCAD** (free) from https://openscad.org
2. Open any `.scad` file in OpenSCAD
3. Update `interior_z` if needed (see comment in file)
4. Press **F5** to preview, **F6** to render
5. Go to **File → Export as STL**
6. Load the STL into your slicer (Cura, PrusaSlicer, etc.) and print

## Wire Holes

All walls are solid by design. **Drill wire holes after test-fitting** your boards inside the printed cases.

## Print Settings (Recommended)

- Material: PLA
- Layer height: 0.2mm
- Infill: 20%
- Estimated total print time: ~3.5–5 hours for all 4 enclosures
