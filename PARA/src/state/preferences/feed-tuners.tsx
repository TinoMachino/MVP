import {useMemo} from 'react'

import {FeedTuner, type FeedViewPostsSlice} from '#/lib/api/feed-manip'
import {type FeedDescriptor} from '../queries/post-feed'
import {usePreferencesQuery} from '../queries/preferences'
import {useSession} from '../session'
import {useBaseFilter} from '../shell/base-filter'
import {usePoliticalAffiliation} from '../shell/political-affiliation'
import {useLanguagePrefs} from './languages'

export function useFeedTuners(
  feedDesc: FeedDescriptor,
  opts?: {applyBaseCommunityFilters?: boolean},
) {
  const langPrefs = useLanguagePrefs()
  const {data: preferences} = usePreferencesQuery()
  const {currentAccount} = useSession()
  const {activeFilters} = useBaseFilter() // Use activeFilters from card selections
  const {affiliation} = usePoliticalAffiliation() // User's declared affiliation

  return useMemo(() => {
    if (feedDesc.startsWith('author')) {
      if (feedDesc.endsWith('|posts_with_replies')) {
        // TODO: Do this on the server instead.
        return [FeedTuner.removeReposts]
      }
    }
    if (feedDesc.startsWith('feedgen')) {
      return [
        FeedTuner.preferredLangOnly(langPrefs.contentLanguages),
        FeedTuner.removeMutedThreads,
      ]
    }
    if (feedDesc === 'following' || feedDesc.startsWith('list')) {
      const feedTuners = [FeedTuner.removeOrphans]

      if (preferences?.feedViewPrefs.hideReposts) {
        feedTuners.push(FeedTuner.removeReposts)
      }
      if (preferences?.feedViewPrefs.hideReplies) {
        feedTuners.push(FeedTuner.removeReplies)
      } else {
        feedTuners.push(
          FeedTuner.followedRepliesOnly({
            userDid: currentAccount?.did || '',
          }),
        )
      }
      if (preferences?.feedViewPrefs.hideQuotePosts) {
        feedTuners.push(FeedTuner.removeQuotePosts)
      }
      feedTuners.push(FeedTuner.dedupThreads)
      feedTuners.push(FeedTuner.removeMutedThreads)

      // Base community filters should only affect the Base feed.
      const allFilters =
        opts?.applyBaseCommunityFilters && affiliation
          ? [...new Set([...activeFilters, affiliation])]
          : opts?.applyBaseCommunityFilters
            ? activeFilters
            : []

      if (allFilters.length > 0) {
        feedTuners.push((_tuner, slices): FeedViewPostsSlice[] => {
          const normalizedFilters = new Set(
            allFilters.map(filter => normalizeCommunityFilter(filter)),
          )

          try {
            return slices
              .map(slice => {
                const filteredItems = slice.items.filter(item => {
                  const postFilters = getPostCommunityFilters(item.post.record)
                  return (
                    postFilters.some(filter => normalizedFilters.has(filter)) ||
                    postTextMatchesFilter(item.post.record, normalizedFilters)
                  )
                })

                if (filteredItems.length === 0) return null

                // Return new slice with filtered items
                // We need to preserve the FeedViewPostsSlice class instance structure if possible,
                // or ensure what we return satisfies the type.
                // Creating a new object with the same prototype is safer than returning a plain object.
                const newSlice = Object.create(
                  Object.getPrototypeOf(slice),
                ) as FeedViewPostsSlice
                Object.assign(newSlice, slice)
                newSlice.items = filteredItems
                return newSlice
              })
              .filter((slice): slice is FeedViewPostsSlice => slice !== null)
          } catch (e) {
            console.error('Error filtering feed:', e)
            return slices
          }
        })
      }

      return feedTuners
    }
    return []
  }, [
    feedDesc,
    currentAccount,
    preferences,
    langPrefs,
    activeFilters,
    affiliation,
    opts?.applyBaseCommunityFilters,
  ])
}

function getPostCommunityFilters(record: Record<string, unknown>) {
  const values = [
    pickString(record.party),
    pickString(record.community),
    pickString(record.category),
    ...pickStringArray(record.communities),
    ...pickStringArray(record.tags),
    ...extractTextLabels(pickString(record.text)),
  ]

  return Array.from(
    new Set(values.map(normalizeCommunityFilter).filter(Boolean)),
  )
}

function normalizeCommunityFilter(value: string) {
  return value.trim().replace(/^p\//i, '').toLowerCase()
}

function postTextMatchesFilter(
  record: Record<string, unknown>,
  normalizedFilters: Set<string>,
) {
  const text = pickString(record.text)
  if (!text) return false

  const normalizedText = normalizeCommunityFilter(text)
  for (const filter of normalizedFilters) {
    if (containsFilterToken(normalizedText, filter)) {
      return true
    }
  }
  return false
}

function extractTextLabels(text: string) {
  if (!text) return []

  const labels: string[] = []
  const prefixMatch = text.match(/^\s*\[([^\]]+)\]/)
  if (prefixMatch?.[1]) {
    labels.push(prefixMatch[1])
  }

  for (const match of text.matchAll(/(?:^|\s)#([\p{L}\p{N}_-]+)/gu)) {
    labels.push(match[1])
  }

  return labels
}

function containsFilterToken(text: string, filter: string) {
  if (!filter) return false
  const escaped = filter.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  return new RegExp(`(^|[^a-z0-9])${escaped}([^a-z0-9]|$)`, 'i').test(text)
}

function pickString(value: unknown) {
  return typeof value === 'string' && value.trim() ? value.trim() : ''
}

function pickStringArray(value: unknown) {
  if (!Array.isArray(value)) return []
  return value
    .map(item => (typeof item === 'string' ? item.trim() : ''))
    .filter(Boolean)
}
