# Data model

## Core entities

- MatchProject
- MatchMetadata
- Team
- Player
- SetState
- Rally
- BallTouch
- MatchEvent
- Lineup
- RotationState
- Substitution

## Modeling strategy

The project stores:
1. stable match metadata
2. team rosters
3. set configuration
4. event history
5. derived statistics

## Why event-based storage

An event-based model makes it easier to:
- fix data entry mistakes
- support undo/redo
- rebuild statistics consistently
- export to other formats
- evolve the model over time
