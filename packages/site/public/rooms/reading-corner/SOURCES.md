# Where the reading corner's files come from (#593)

Everything in this folder is a bake: `room-audition.glb` and the images it names
(`bake/`, `light/`, `tex/`, and the same set as KTX2 in `ktx-etc1s/`), made by
`packages/site/rooms/shared/build_room.py` from the inputs listed in
`packages/site/rooms/reading-corner/inputs.json`. `packages/site/rooms/reading-corner/build.json`
records the bake and the SHA-256 of every file here. The bake is **made here**, from the sources
below; every model is changed by it (placed, decimated, retextured where noted, baked together with
the room's light), so none of them is shipped as its author made it. The room's walls, floor,
ceiling, picture frames, mouldings, the throw over the chest, the standing lamp, the candles, the
hero chair and the rug's fold are built by the scripts in `packages/site/rooms/` and are made here.

## CC BY 4.0: credited as the licence asks

Each is used under [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/), changed as described.

| Title | Author | Link | Used for |
| --- | --- | --- | --- |
| Victorian Desk | Faheem Yusuf | <https://sketchfab.com/3d-models/ac061b3de2b9480d8ca175e9fdc0c785> | the desk |
| Globe on a wooden stand in Victorian style | Rylae Shylna | <https://sketchfab.com/3d-models/54245a6f6f8a425d93dfa3892445cab4> | the globe |
| Monstera Deliciosa Potted Mid-Century plant | Giora | <https://sketchfab.com/3d-models/1ab9bf841df04c07b1819be596327629> | the plant |
| Lamp (Bankers Lamp) | Patrick Matthew | <https://sketchfab.com/3d-models/fb7b850b5aa04cb48999f4cd58d7eaca> | the banker's lamp |
| Vintage Desk Assets | Hobu | <https://sketchfab.com/3d-models/280db303f4d64354aa3e7b71f4652813> | the books on the desk and in the floor's two stacks, the inkwell, the pen and the world map above the desk |
| Letter | Incg5764 | <https://sketchfab.com/3d-models/303b287819a84f7496bd92f5d69710c7> | the sealed letter |
| Metal Round Glasses | rikokenz | <https://sketchfab.com/3d-models/f9128bd394214539af2ac80e4204bd35> | the spectacles |
| Sand Blotter EOA:2022.154 OE414 | Portland Museum | <https://sketchfab.com/3d-models/51ed4daff7a147ee859a85cbbbea1f09> | the sand blotter (a scan) |

## CC0 and public domain: credited as a courtesy

| Title | Author | Link | Licence | Used for |
| --- | --- | --- | --- | --- |
| Chair (England) 1750-60 | The Smithsonian Institution | <https://sketchfab.com/3d-models/40688b848b6044f6af306ecdf2b8b105> | CC0 | the desk chair: a scan with no colour, so its red walnut and dark carving are painted here after the Cooper Hewitt's photographs, and its seat is cut away and rebuilt here (`dress/chair_seat.py`) |
| Treasure Chest | Rico Cilliers | <https://polyhaven.com/a/treasure_chest> | CC0 | the chest |
| Chandelier 03 | Kirill Sannikov | <https://polyhaven.com/a/Chandelier_03> | CC0 | the chandelier |
| Vintage Pocket Watch | Tal Swicegood | <https://polyhaven.com/a/vintage_pocket_watch> | CC0 | the watch on the desk |
| Postcard Set 01 | James Ray Cock, Jurita Burger | <https://polyhaven.com/a/postcard_set_01> | CC0 | the postcards |
| Mantel Clock 01 | Yann Kervran, Rico Cilliers | <https://polyhaven.com/a/mantel_clock_01> | CC0 | the clock |
| Book Encyclopedia Set 01 | John Malcolm | <https://polyhaven.com/a/book_encyclopedia_set_01> | CC0 | the encyclopedias |
| Side Table Tall 01 | James Ray Cock | <https://polyhaven.com/a/side_table_tall_01> | CC0 | the side table, baked with the room's light into its own unwrap |
| Floral Jacquard | colormass, Rico Cilliers | <https://polyhaven.com/a/floral_jacquard> | CC0 | the desk chair's damask, recoloured crimson |
| American Walnut Veneer | Jenelle van Heerden | <https://polyhaven.com/a/american_walnut_veneer> | CC0 | the frames |
| Black Walnut Veneer 01 | Jenelle van Heerden | <https://polyhaven.com/a/black_walnut_veneer_01> | CC0 | the hero chair's wood |
| Leather Red 02 | Rob Tuytel | <https://polyhaven.com/a/leather_red_02> | CC0 | the hero chair's leather |
| Plank Flooring | Dario Barresi, Dimitrios Savva, Rico Cilliers | <https://polyhaven.com/a/plank_flooring> | CC0 | the floor (`tex/plank_flooring_diff.webp`, darkened on the page) |
| Silk Animal Carpet, object 446642, photo DP229989 | The Metropolitan Museum of Art | <https://www.metmuseum.org/art/collection/search/446642> | public domain (Open Access, CC0) | the rug, flattened from the photograph by `rug_from_photo.py` and its worn margin painted over by `rug.py` (`tex/rug-met-446642.webp`) |
| Willow, William Morris, 1874, object 398344, photo DP306739 | The Metropolitan Museum of Art | <https://www.metmuseum.org/art/collection/search/398344> | public domain (Open Access, CC0) | the wallpaper, one tile cut from the photograph by `wallpaper_from_scan.py` (`tex/wallpaper-willow.webp`) |
| Melencolia I, 1514 | Albrecht Duerer | <https://www.metmuseum.org/art/collection/search/336228> | public domain (Open Access, CC0) | a framed print |
| Saint Jerome in His Study, 1514 | Albrecht Duerer | <https://www.metmuseum.org/art/collection/search/336229> | public domain (Open Access, CC0) | a framed print |
| Knight, Death and the Devil, 1513 | Albrecht Duerer | <https://www.metmuseum.org/art/collection/search/336223> | public domain (Open Access, CC0) | a framed print |
| Aristotle with a Bust of Homer, 1653 | Rembrandt | <https://www.metmuseum.org/art/collection/search/437394> | public domain (Open Access, CC0) | a framed print |
| The Gulf Stream, 1899 | Winslow Homer | <https://www.metmuseum.org/art/collection/search/11122> | public domain (Open Access, CC0) | a framed print |
| Frances (Appleton) Longfellow to Emmeline (Austin) Wadsworth, 22 September 1851 | Frances Longfellow | <https://commons.wikimedia.org/wiki/File:Frances_(Appleton)_Longfellow_to_Emmeline_(Austin)_Wadsworth,_22_September_1851_(1a6fb63e-4035-449d-a2fb-c2110e3af2e6).jpg> | public domain | the half-written letter on the desk, its left page |

The room's tone is built on Poly Haven's CC0 library (<https://polyhaven.com/license>) and the
Met's Open Access programme (<https://www.metmuseum.org/about-the-met/policies-and-documents/open-access>).
`tex/rug-fringe.webp` (the fringe's cotton) and `tex/rug-pile.webp` (the pile grain) are generated
by `rug.py`, made here.
