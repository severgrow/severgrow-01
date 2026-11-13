# FUTASAKU gameplay showcase

Owner-requested gameplay footage, recorded 13 November 2026 from commit
`b82a6ed8fb011b3c824c7f8bff94a46f6c32273c` (Beta 0.85 performance candidate).

## Files

| File | Moment | Length |
| --- | --- | --- |
| `FUTASAKU-five-moments.mp4` | Combined showcase | 20.88 s |
| `01-blast.mp4` | Blast removes an enemy cluster | 4.20 s |
| `02-bomb.mp4` | Bomb removes an enemy strength-nine tile | 4.16 s |
| `03-chain-cut.mp4` | One Grow cuts off nine enemy tiles | 4.16 s |
| `04-bloom.mp4` | Five-tile Bloom expands the player's land | 4.20 s |
| `05-winning-surround.mp4` | Final surrounding move wins the game | 4.16 s |

The combined edit plays Blast, Bloom, Bomb, chain cut, then winning surround.
All clips are portrait 720 x 1280, 25 fps, H.264 MP4, silent, with fast-start
metadata for streaming. These are staged board positions with validated legal
moves, captured from the actual game's renderer and animations. No generated
or simulated replacement artwork is used.

## Handoff

The files live on branch `media/gameplay-showcase`. To retrieve them without
changing the other agent's current branch or working files:

```sh
git fetch origin media/gameplay-showcase
git worktree add --detach ../futasaku-showcase-media origin/media/gameplay-showcase
```

Open `../futasaku-showcase-media/media/gameplay-showcase/FUTASAKU-five-moments.mp4`
in a video player. The five source clips are beside it.

This commit contains media and this note only. Files are outside `web/public`,
so fetching or integrating them does not add downloads to the game or publish
anything. No app release or server deployment is needed to use the videos.

Validation: all six MP4s inspected with ffprobe; the combined video decoded
successfully with ffmpeg. Representative frames were visually reviewed. Game
source is unchanged by this media handoff.
