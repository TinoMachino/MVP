import {useMutation, useQuery, useQueryClient} from '@tanstack/react-query'

import {STALE} from '#/state/queries'
import {useAgent} from '#/state/session'

const RQKEY_ROOT = 'community-boards'

export type CommunityBoardView = {
  uri: string
  cid: string
  creatorDid: string
  creatorHandle?: string
  creatorDisplayName?: string
  communityId: string
  slug: string
  name: string
  description?: string
  quadrant: string
  delegatesChatId: string
  subdelegatesChatId: string
  memberCount: number
  viewerMembershipState:
    | 'none'
    | 'pending'
    | 'active'
    | 'left'
    | 'removed'
    | 'blocked'
  viewerRoles?: string[]
  status?: 'draft' | 'active'
  founderStarterPackUri?: string
  createdAt: string
  governanceSummary?: {
    moderatorCount: number
    officialCount: number
    deputyRoleCount: number
    lastPublishedAt?: string
  }
}

export type CommunityBoardsResponse = {
  boards: CommunityBoardView[]
  canCreateCommunity: boolean
  cursor?: string
}

export type CommunityBoardResponse = {
  board: CommunityBoardView
  viewerCapabilities: string[]
}

type CreateCommunityInput = {
  name: string
  quadrant: string
  description?: string
  founderStarterPackName?: string
}

type AcceptDraftInviteInput = {
  communityUri: string
}

type AcceptDraftInviteResponse = {
  status: 'draft' | 'active'
  memberCount: number
}

type CreateCommunityResponse = {
  uri: string
  cid: string
  delegatesChatId: string
  subdelegatesChatId: string
}

export type CommunityMemberView = {
  did: string
  handle?: string
  displayName?: string
  avatar?: string
  membershipState: string
  roles?: string[]
  joinedAt: string
  votesCast: number
  delegationsReceived: number
  policyPosts: number
  matterPosts: number
}

export type CommunityMembersResponse = {
  members: CommunityMemberView[]
  cursor?: string
}

export type CommunityBoardsQueryOptions = {
  limit?: number
  query?: string
  state?: string
  quadrant?: string
  participationKind?: 'matter' | 'policy'
  flairId?: string
  sort?: 'recent' | 'activity' | 'size'
  cursor?: string
}

export type CommunityMembersQueryOptions = {
  communityId?: string
  membershipState?: string
  role?: string
  sort?: 'joined' | 'participation'
  limit?: number
  cursor?: string
}

export const communityBoardsQueryKey = (opts: CommunityBoardsQueryOptions) => [
  RQKEY_ROOT,
  'list',
  opts.limit ?? 12,
  opts.query ?? '',
  opts.state ?? '',
  opts.quadrant ?? '',
  opts.participationKind ?? '',
  opts.flairId ?? '',
  opts.sort ?? '',
  opts.cursor ?? '',
]

export const communityMembersQueryKey = (
  opts: CommunityMembersQueryOptions,
) => [
  RQKEY_ROOT,
  'members',
  opts.communityId ?? '',
  opts.membershipState ?? '',
  opts.role ?? '',
  opts.sort ?? '',
  opts.limit ?? 50,
  opts.cursor ?? '',
]

export const communityBoardQueryKey = ({
  communityId,
  uri,
}: {
  communityId?: string
  uri?: string
}) => [RQKEY_ROOT, 'detail', communityId || '', uri || '']

export function useCommunityBoardsQuery(
  opts: CommunityBoardsQueryOptions = {},
) {
  const agent = useAgent()
  const options = {limit: 12, ...opts}

  return useQuery<CommunityBoardsResponse>({
    staleTime: STALE.SECONDS.THIRTY,
    queryKey: communityBoardsQueryKey(options),
    queryFn: async () => fetchCommunityBoards({agent, opts: options}),
  })
}

export function useCommunityBoardQuery({
  communityId,
  uri,
  enabled = true,
}: {
  communityId?: string
  uri?: string
  enabled?: boolean
}) {
  const agent = useAgent()

  return useQuery<CommunityBoardResponse>({
    staleTime: STALE.SECONDS.THIRTY,
    enabled: enabled && Boolean(communityId || uri),
    queryKey: communityBoardQueryKey({communityId, uri}),
    queryFn: async () => fetchCommunityBoard({agent, communityId, uri}),
  })
}

export function useCommunityMembersQuery(opts: CommunityMembersQueryOptions) {
  const agent = useAgent()
  const options = {limit: 50, membershipState: 'active', ...opts}

  return useQuery<CommunityMembersResponse>({
    staleTime: STALE.SECONDS.THIRTY,
    enabled: Boolean(options.communityId),
    queryKey: communityMembersQueryKey(options),
    queryFn: async () => fetchCommunityMembers({agent, opts: options}),
  })
}

export function useCreateCommunityMutation() {
  const agent = useAgent()
  const queryClient = useQueryClient()

  return useMutation<CreateCommunityResponse, Error, CreateCommunityInput>({
    mutationFn: async input => createCommunity({agent, input}),
    onSuccess: () => {
      void queryClient.invalidateQueries({queryKey: [RQKEY_ROOT]})
    },
  })
}

export function useAcceptDraftInviteMutation() {
  const agent = useAgent()
  const queryClient = useQueryClient()

  return useMutation<AcceptDraftInviteResponse, Error, AcceptDraftInviteInput>({
    mutationFn: async input => acceptDraftInvite({agent, input}),
    onSuccess: () => {
      void queryClient.invalidateQueries({queryKey: [RQKEY_ROOT]})
    },
  })
}

type JoinCommunityInput = {
  communityUri: string
  source?: string
}

type JoinCommunityResponse = {
  uri: string
  cid: string
  communityUri: string
  membershipState: CommunityBoardView['viewerMembershipState']
  viewerCapabilities: string[]
}

type LeaveCommunityInput = {
  communityUri: string
}

type LeaveCommunityResponse = {
  uri: string
  cid: string
  communityUri: string
  membershipState: CommunityBoardView['viewerMembershipState']
  viewerCapabilities: string[]
}

export function useJoinCommunityMutation() {
  const agent = useAgent()
  const queryClient = useQueryClient()

  return useMutation<JoinCommunityResponse, Error, JoinCommunityInput>({
    mutationFn: async input => joinCommunity({agent, input}),
    onSuccess: (data, variables) => {
      updateCommunityMembershipCaches({
        queryClient,
        communityUri: variables.communityUri,
        membershipState: data.membershipState,
        viewerCapabilities: data.viewerCapabilities,
      })
      void queryClient.invalidateQueries({queryKey: [RQKEY_ROOT]})
    },
  })
}

export function useLeaveCommunityMutation() {
  const agent = useAgent()
  const queryClient = useQueryClient()

  return useMutation<LeaveCommunityResponse, Error, LeaveCommunityInput>({
    mutationFn: async input => leaveCommunity({agent, input}),
    onSuccess: (data, variables) => {
      updateCommunityMembershipCaches({
        queryClient,
        communityUri: variables.communityUri,
        membershipState: data.membershipState,
        viewerCapabilities: data.viewerCapabilities,
      })
      void queryClient.invalidateQueries({queryKey: [RQKEY_ROOT]})
    },
  })
}

function updateCommunityMembershipCaches({
  queryClient,
  communityUri,
  membershipState,
  viewerCapabilities,
}: {
  queryClient: ReturnType<typeof useQueryClient>
  communityUri: string
  membershipState: CommunityBoardView['viewerMembershipState']
  viewerCapabilities: string[]
}) {
  queryClient.setQueriesData<CommunityBoardsResponse>(
    {queryKey: [RQKEY_ROOT, 'list']},
    cached => {
      if (!cached) return cached
      return {
        ...cached,
        boards: cached.boards.map(board =>
          updateBoardMembership(board, communityUri, membershipState),
        ),
      }
    },
  )

  queryClient.setQueriesData<CommunityBoardResponse>(
    {queryKey: [RQKEY_ROOT, 'detail']},
    cached => {
      if (!cached || cached.board.uri !== communityUri) return cached
      return {
        ...cached,
        board: updateBoardMembership(
          cached.board,
          communityUri,
          membershipState,
        ),
        viewerCapabilities,
      }
    },
  )
}

function updateBoardMembership(
  board: CommunityBoardView,
  communityUri: string,
  membershipState: CommunityBoardView['viewerMembershipState'],
) {
  if (board.uri !== communityUri) return board

  const wasActive = board.viewerMembershipState === 'active'
  const isActive = membershipState === 'active'
  const memberDelta = wasActive === isActive ? 0 : isActive ? 1 : -1

  return {
    ...board,
    viewerMembershipState: membershipState,
    viewerRoles: isActive ? (board.viewerRoles ?? []) : undefined,
    memberCount: Math.max(0, board.memberCount + memberDelta),
  }
}

async function fetchCommunityBoards({
  agent,
  opts,
}: {
  agent: ReturnType<typeof useAgent>
  opts: CommunityBoardsQueryOptions
}): Promise<CommunityBoardsResponse> {
  const res = await agent.call('com.para.community.listBoards', {
    limit: opts.limit ?? 12,
    query: opts.query,
    state: opts.state,
    quadrant: opts.quadrant,
    participationKind: opts.participationKind,
    flairId: opts.flairId,
    sort: opts.sort,
    cursor: opts.cursor,
  })

  return normalizeCommunityBoardsResponse(res.data)
}

async function fetchCommunityMembers({
  agent,
  opts,
}: {
  agent: ReturnType<typeof useAgent>
  opts: CommunityMembersQueryOptions
}): Promise<CommunityMembersResponse> {
  const res = await agent.call('com.para.community.listMembers', {
    communityId: opts.communityId ?? '',
    limit: opts.limit ?? 50,
    membershipState: opts.membershipState,
    role: opts.role,
    sort: opts.sort,
    cursor: opts.cursor,
  })

  return normalizeCommunityMembersResponse(res.data)
}

async function fetchCommunityBoard({
  agent,
  communityId,
  uri,
}: {
  agent: ReturnType<typeof useAgent>
  communityId?: string
  uri?: string
}): Promise<CommunityBoardResponse> {
  const res = await agent.call('com.para.community.getBoard', {
    communityId,
    uri,
  })

  return normalizeCommunityBoardResponse(res.data)
}

async function createCommunity({
  agent,
  input,
}: {
  agent: ReturnType<typeof useAgent>
  input: CreateCommunityInput
}): Promise<CreateCommunityResponse> {
  const res = await agent.call(
    'com.para.community.createBoard',
    undefined,
    input,
  )

  const json = asRecord(res.data)
  return {
    uri: readString(json?.uri) ?? '',
    cid: readString(json?.cid) ?? '',
    delegatesChatId: readString(json?.delegatesChatId) ?? '',
    subdelegatesChatId: readString(json?.subdelegatesChatId) ?? '',
  }
}

function normalizeCommunityBoardsResponse(
  json: unknown,
): CommunityBoardsResponse {
  const data = asRecord(json) ?? {}
  const boards = Array.isArray(data.boards) ? data.boards : []

  return {
    boards: boards.map(normalizeBoard),
    canCreateCommunity: Boolean(data.canCreateCommunity),
    cursor: readString(data.cursor),
  }
}

function normalizeCommunityMembersResponse(
  json: unknown,
): CommunityMembersResponse {
  const data = asRecord(json) ?? {}
  const members = Array.isArray(data.members) ? data.members : []

  return {
    members: members.map(normalizeMember),
    cursor: readString(data.cursor),
  }
}

function normalizeCommunityBoardResponse(
  json: unknown,
): CommunityBoardResponse {
  const data = asRecord(json) ?? {}
  return {
    board: normalizeBoard(data.board),
    viewerCapabilities: Array.isArray(data.viewerCapabilities)
      ? data.viewerCapabilities.filter(
          capability => typeof capability === 'string',
        )
      : [],
  }
}

function normalizeMember(json: unknown): CommunityMemberView {
  const data = asRecord(json) ?? {}
  return {
    did: readString(data.did) ?? '',
    handle: readString(data.handle),
    displayName: readString(data.displayName),
    avatar: readString(data.avatar),
    membershipState: readString(data.membershipState) ?? 'active',
    roles: Array.isArray(data.roles)
      ? data.roles.filter(role => typeof role === 'string')
      : undefined,
    joinedAt: readString(data.joinedAt) ?? '',
    votesCast: normalizeNumber(data.votesCast),
    delegationsReceived: normalizeNumber(data.delegationsReceived),
    policyPosts: normalizeNumber(data.policyPosts),
    matterPosts: normalizeNumber(data.matterPosts),
  }
}

function normalizeBoard(json: unknown): CommunityBoardView {
  const data = asRecord(json) ?? {}
  const governanceSummary = asRecord(data.governanceSummary)

  return {
    uri: readString(data.uri) ?? '',
    cid: readString(data.cid) ?? '',
    creatorDid: readString(data.creatorDid) ?? '',
    creatorHandle: readString(data.creatorHandle),
    creatorDisplayName: readString(data.creatorDisplayName),
    communityId: readString(data.communityId) ?? '',
    slug: readString(data.slug) ?? '',
    name: readString(data.name) ?? '',
    description: readString(data.description),
    quadrant: readString(data.quadrant) ?? '',
    delegatesChatId: readString(data.delegatesChatId) ?? '',
    subdelegatesChatId: readString(data.subdelegatesChatId) ?? '',
    memberCount:
      typeof data.memberCount === 'number'
        ? data.memberCount
        : Number(readString(data.memberCount) ?? 0),
    viewerMembershipState: normalizeMembershipState(data.viewerMembershipState),
    viewerRoles: Array.isArray(data.viewerRoles)
      ? data.viewerRoles.filter(role => typeof role === 'string')
      : undefined,
    status: normalizeStatus(data.status),
    founderStarterPackUri: readString(data.founderStarterPackUri),
    createdAt: readString(data.createdAt) ?? '',
    governanceSummary: governanceSummary
      ? {
          moderatorCount: normalizeNumber(governanceSummary.moderatorCount),
          officialCount: normalizeNumber(governanceSummary.officialCount),
          deputyRoleCount: normalizeNumber(governanceSummary.deputyRoleCount),
          lastPublishedAt: readString(governanceSummary.lastPublishedAt),
        }
      : undefined,
  }
}

function normalizeMembershipState(
  value: unknown,
): CommunityBoardView['viewerMembershipState'] {
  switch (value) {
    case 'pending':
    case 'active':
    case 'left':
    case 'removed':
    case 'blocked':
      return value
    default:
      return 'none'
  }
}

function asRecord(value: unknown): Record<string, unknown> | undefined {
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    return value as Record<string, unknown>
  }
  return undefined
}

function readString(value: unknown): string | undefined {
  return typeof value === 'string' ? value : undefined
}

function normalizeNumber(value: unknown): number {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value
  }

  const parsed = Number(readString(value) ?? value ?? 0)
  return Number.isFinite(parsed) ? parsed : 0
}

function normalizeStatus(value: unknown): CommunityBoardView['status'] {
  switch (value) {
    case 'draft':
    case 'active':
      return value
    default:
      return undefined
  }
}

async function joinCommunity({
  agent,
  input,
}: {
  agent: ReturnType<typeof useAgent>
  input: JoinCommunityInput
}): Promise<JoinCommunityResponse> {
  const res = await agent.call('com.para.community.join', undefined, input)

  const json = asRecord(res.data)
  return {
    uri: readString(json?.uri) ?? '',
    cid: readString(json?.cid) ?? '',
    communityUri: readString(json?.communityUri) ?? '',
    membershipState: normalizeMembershipState(json?.membershipState),
    viewerCapabilities: Array.isArray(json?.viewerCapabilities)
      ? json.viewerCapabilities.filter((c: unknown) => typeof c === 'string')
      : [],
  }
}

async function leaveCommunity({
  agent,
  input,
}: {
  agent: ReturnType<typeof useAgent>
  input: LeaveCommunityInput
}): Promise<LeaveCommunityResponse> {
  const res = await agent.call('com.para.community.leave', undefined, input)

  const json = asRecord(res.data)
  return {
    uri: readString(json?.uri) ?? '',
    cid: readString(json?.cid) ?? '',
    communityUri: readString(json?.communityUri) ?? '',
    membershipState: normalizeMembershipState(json?.membershipState),
    viewerCapabilities: Array.isArray(json?.viewerCapabilities)
      ? json.viewerCapabilities.filter((c: unknown) => typeof c === 'string')
      : [],
  }
}

async function acceptDraftInvite({
  agent,
  input,
}: {
  agent: ReturnType<typeof useAgent>
  input: AcceptDraftInviteInput
}): Promise<AcceptDraftInviteResponse> {
  const res = await agent.call(
    'com.para.community.acceptDraftInvite',
    undefined,
    input,
  )

  const json = asRecord(res.data)
  return {
    status: (readString(json?.status) as 'draft' | 'active') ?? 'draft',
    memberCount: typeof json?.memberCount === 'number' ? json.memberCount : 0,
  }
}
