import { describe, expect, it } from 'vitest'

import {
  assertPlayerMatchRowOwner,
  filterPlayerMatchRowsByOwner,
  readRawParticipantUid,
  selectMatchDetailParticipant,
} from './playerMatchOwnership.js'
import type { MatchDetailContract } from '../contracts/matchDetail.js'

const MINE_UID = 'mine-uid'
const HAYING_UID = 'haying-uid'

describe('playerMatchOwnership', () => {
  it('readRawParticipantUid reads uid/userNum from rawJson', () => {
    expect(readRawParticipantUid({ uid: MINE_UID })).toBe(MINE_UID)
    expect(readRawParticipantUid({ userNum: 1009897353 })).toBe('1009897353')
  })

  it('assertPlayerMatchRowOwner flags foreign source participant', () => {
    expect(
      assertPlayerMatchRowOwner(
        { uid: MINE_UID, gameId: '1', rawJson: { uid: HAYING_UID } },
        MINE_UID,
      ),
    ).not.toBeNull()
  })

  it('filterPlayerMatchRowsByOwner keeps owner rows only', () => {
    const rows = [
      { uid: MINE_UID, gameId: '1', rawJson: { uid: MINE_UID } },
      { uid: HAYING_UID, gameId: '1', rawJson: { uid: HAYING_UID } },
    ]
    expect(filterPlayerMatchRowsByOwner(rows, MINE_UID)).toHaveLength(1)
  })

  it('selectMatchDetailParticipant requires requested canonical uid', () => {
    const detail: MatchDetailContract = {
      gameId: '99',
      gameMode: 'cobalt',
      playedAt: '2026-06-01T00:00:00.000Z',
      detailStatus: 'ready',
      teams: [
        {
          teamNumber: 1,
          teamRank: 1,
          participants: [
            {
              participantId: '99:1:1:6:mine',
              uid: MINE_UID,
              nickname: 'mine',
              teamNumber: 1,
              teamRank: 1,
              placement: 1,
              characterNum: 6,
              characterName: 'nadine',
              kills: 3,
              deaths: 0,
              assists: 1,
            },
          ],
        },
      ],
    }
    expect(selectMatchDetailParticipant(detail, null, MINE_UID, 1009897353)?.participant.characterNum).toBe(6)
    expect(selectMatchDetailParticipant(detail, null, 'missing', 1)).toBeNull()
  })
})