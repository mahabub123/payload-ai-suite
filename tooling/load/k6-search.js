/**
 * Search load test — 15 requests/s (design doc §5 peak ≈ 12/s), p95 < 300 ms end to end (§4).
 *   k6 run -e BASE_URL=http://localhost:3000 tooling/load/k6-search.js
 */
import http from 'k6/http'
import { check } from 'k6'
import { Rate } from 'k6/metrics'

const BASE = __ENV.BASE_URL || 'http://localhost:3000'
const keywordFallback = new Rate('search_keyword_fallback')

export const options = {
  scenarios: {
    search: {
      executor: 'constant-arrival-rate',
      rate: Number(__ENV.RATE || 15),
      timeUnit: '1s',
      duration: __ENV.DURATION || '2m',
      preAllocatedVUs: 30,
      maxVUs: 100,
    },
  },
  thresholds: {
    http_req_duration: ['p(95)<300'],
    'http_req_duration{kind:short}': ['p(95)<150'],
    http_req_failed: ['rate<0.01'],
    checks: ['rate>0.99'],
  },
}

// Short queries skip query understanding (< 150 ms budget); long ones may use the fast model.
const QUERIES = [
  ['saree', 'short'],
  ['honey', 'short'],
  ['panjabi', 'short'],
  ['শাড়ি', 'short'],
  ['মধু', 'short'],
  ['walton phone', 'short'],
  ['red saree under 3000 taka', 'long'],
  ['wireless earbuds with long battery', 'long'],
  ['৩০০০ টাকার নিচে লাল শাড়ি', 'long'],
  ['gift for eid under 2000 taka', 'long'],
]

export default function () {
  const [q, kind] = QUERIES[Math.floor(Math.random() * QUERIES.length)]
  // Spread the load over simulated shoppers (stable visitor cookie + client IP per VU) so the per-visitor and
  // per-IP rate limits behave as they would for real traffic, not one client at 15 req/s.
  const headers = {
    Cookie: `ai_vid=k6-loadtest-visitor-${String(__VU).padStart(4, '0')}`,
    'X-Forwarded-For': `10.1.${Math.floor(__VU / 250)}.${(__VU % 250) + 1}`,
  }
  const res = http.get(`${BASE}/api/ai/search?q=${encodeURIComponent(q)}`, { headers, tags: { kind, name: 'search' } })
  let body = {}
  try {
    body = res.json()
  } catch (_) {
    body = {}
  }
  keywordFallback.add(body.mode === 'keyword')
  check(res, {
    'status 200': (r) => r.status === 200,
    'has items array': () => Array.isArray(body.items),
    'has requestId': () => typeof body.requestId === 'string',
  })
}
