// @ts-nocheck
import { jsonToLex } from '@atproto/lexicon'
import { AppContext } from '../../../../context'
import { Server } from '../../../../lexicon'
import { ids } from '../../../../lexicon/lexicons'
import { OutputSchema } from '../../../../lexicon/types/com/para/community/getBoard'
import {
  asPipeThroughBuffer,
  computeProxyTo,
  isJsonContentType,
  pipethrough,
} from '../../../../pipethrough'
import { formatMungedResponse } from '../../../../read-after-write'
import {
  findLocalBoard,
  getFoundingMemberCount,
  getLocalGovernance,
  getLocalMembership,
  getViewerCapabilities,
  toGetBoardView,
  toGovernanceSummary,
} from './util'

export default function (server: Server, ctx: AppContext) {
  if (!ctx.bskyAppView) return

  server.com.para.community.getBoard({
    auth: ctx.authVerifier.authorization({
      authorize: (permissions, { req }) => {
        const lxm = ids.ComParaCommunityGetBoard
        const aud = computeProxyTo(ctx, req, lxm)
        permissions.assertRpc({ aud, lxm })
      },
    }),
    handler: async ({ auth, req, params }) => {
      const viewerDid = auth.credentials.did

      const local = await ctx.actorStore.read(viewerDid, async (store) => {
        const board = await findLocalBoard({
          store,
          uri: params.uri,
          communityId: params.communityId,
        })
        if (!board) return null

        const [membership, governance, foundingMemberCount] = await Promise.all(
          [
            getLocalMembership({ store, viewerDid, boardUri: board.uri }),
            getLocalGovernance({ store, creatorDid: viewerDid, board }),
            getFoundingMemberCount({ store, board }),
          ],
        )

        return {
          board: toGetBoardView({
            board,
            creatorDid: viewerDid,
            viewerMembershipState: membership?.membershipState ?? 'active',
            viewerRoles: membership?.roles ?? ['owner', 'moderator'],
            memberCount: foundingMemberCount,
          }),
          viewerCapabilities: getViewerCapabilities(
            membership ?? {
              membershipState: 'active',
              roles: ['owner', 'moderator'],
            },
          ),
          governanceSummary: toGovernanceSummary(governance),
        }
      })

      if (local) {
        return formatMungedResponse<OutputSchema>({
          board: {
            ...local.board,
            governanceSummary: local.governanceSummary,
          },
          viewerCapabilities: local.viewerCapabilities,
        })
      }

      const streamRes = await pipethrough(ctx, req, { iss: viewerDid })
      if (isJsonContentType(streamRes.headers['content-type']) === false) {
        return streamRes
      }

      let bufferRes: Awaited<ReturnType<typeof asPipeThroughBuffer>> | undefined
      try {
        const { buffer } = (bufferRes = await asPipeThroughBuffer(streamRes))
        const body = jsonToLex(
          JSON.parse(buffer.toString('utf8')),
        ) as OutputSchema
        const mungedBody = await ctx.actorStore.read(
          viewerDid,
          async (store) => {
            if (!body.board?.uri) return body

            const membership = await getLocalMembership({
              store,
              viewerDid,
              boardUri: body.board.uri,
            })
            if (!membership) return body

            const wasActive = body.board.viewerMembershipState === 'active'
            const isActive = membership.membershipState === 'active'
            const memberDelta = wasActive === isActive ? 0 : isActive ? 1 : -1

            return {
              ...body,
              board: {
                ...body.board,
                viewerMembershipState: membership.membershipState,
                viewerRoles: membership.roles,
                memberCount: Math.max(
                  0,
                  (body.board.memberCount ?? 0) + memberDelta,
                ),
              },
              viewerCapabilities: getViewerCapabilities(membership),
            }
          },
        )

        return formatMungedResponse(mungedBody)
      } catch {
        return bufferRes ?? streamRes
      }
    },
  })
}
