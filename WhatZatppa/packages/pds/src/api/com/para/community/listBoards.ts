// @ts-nocheck
import { jsonToLex } from '@atproto/lexicon'
import { AppContext } from '../../../../context'
import { Server } from '../../../../lexicon'
import { ids } from '../../../../lexicon/lexicons'
import { OutputSchema } from '../../../../lexicon/types/com/para/community/listBoards'
import {
  asPipeThroughBuffer,
  computeProxyTo,
  isJsonContentType,
  pipethrough,
} from '../../../../pipethrough'
import { formatMungedResponse } from '../../../../read-after-write'
import {
  getFoundingMemberCount,
  getLocalMembership,
  listLocalBoards,
  toListBoardView,
} from './util'

export default function (server: Server, ctx: AppContext) {
  if (!ctx.bskyAppView) return

  server.com.para.community.listBoards({
    auth: ctx.authVerifier.authorization({
      authorize: (permissions, { req }) => {
        const lxm = ids.ComParaCommunityListBoards
        const aud = computeProxyTo(ctx, req, lxm)
        permissions.assertRpc({ aud, lxm })
      },
    }),
    handler: async ({ auth, req, params }) => {
      const viewerDid = auth.credentials.did
      const streamRes = await pipethrough(ctx, req, { iss: viewerDid })

      const localBoards = await ctx.actorStore.read(
        viewerDid,
        async (store) => {
          const boards = await listLocalBoards(store, params.limit || 50)
          return Promise.all(
            boards.map(async (board) => {
              const [membership, foundingMemberCount] = await Promise.all([
                getLocalMembership({
                  store,
                  viewerDid,
                  boardUri: board.uri,
                }),
                getFoundingMemberCount({ store, board }),
              ])

              return toListBoardView({
                board,
                creatorDid: viewerDid,
                viewerMembershipState: membership?.membershipState ?? 'active',
                viewerRoles: membership?.roles ?? ['owner', 'moderator'],
                memberCount: foundingMemberCount,
              })
            }),
          )
        },
      )

      if (isJsonContentType(streamRes.headers['content-type']) === false) {
        return streamRes
      }

      let bufferRes: Awaited<ReturnType<typeof asPipeThroughBuffer>> | undefined
      try {
        const { buffer } = (bufferRes = await asPipeThroughBuffer(streamRes))
        const body = jsonToLex(
          JSON.parse(buffer.toString('utf8')),
        ) as OutputSchema
        const appViewBoards = await ctx.actorStore.read(
          viewerDid,
          async (store) =>
            Promise.all(
              body.boards.map(async (board) => {
                const membership = await getLocalMembership({
                  store,
                  viewerDid,
                  boardUri: board.uri,
                })
                if (!membership) return board

                const wasActive = board.viewerMembershipState === 'active'
                const isActive = membership.membershipState === 'active'
                const memberDelta =
                  wasActive === isActive ? 0 : isActive ? 1 : -1

                return {
                  ...board,
                  viewerMembershipState: membership.membershipState,
                  viewerRoles: membership.roles,
                  memberCount: Math.max(
                    0,
                    (board.memberCount ?? 0) + memberDelta,
                  ),
                }
              }),
            ),
        )
        const seen = new Set(appViewBoards.map((board) => board.uri))
        const mergedBoards = [
          ...localBoards.filter((board) => !seen.has(board.uri)),
          ...appViewBoards,
        ]

        return formatMungedResponse<OutputSchema>({
          ...body,
          boards: mergedBoards.slice(0, params.limit || 50),
        })
      } catch {
        return bufferRes ?? streamRes
      }
    },
  })
}
