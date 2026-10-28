/**
 * Assistant SSE load test — 50 concurrent streams (design doc §5: ~46 at peak), TTFT p95 < 2 s (§4).
 *
 * Start the target with the delayed-stream mock so the test measures the suite, not a vendor:
 *   AI_MOCK=1 AI_MOCK_DELAY_MS=40 pnpm --filter dev-store start
 *   k6 run -e BASE_URL=http://localhost:3000 tooling/load/k6-assistant.js
 *
 * k6 buffers the SSE body; `http_req_waiting` (time to first byte) approximates time-to-first-token because
 * the server flushes the first frame as soon as the stream starts.
 */
import http from 'k6/http'
import { check, sleep } from 'k6'
import { Counter, Trend } from 'k6/metrics'

const BASE = __ENV.BASE_URL || 'http://localhost:3000'
const ttft = new Trend('assistant_ttft_ms', true)
const streamMs = new Trend('assistant_stream_ms', true)
const incomplete = new Counter('assistant_incomplete_streams')

export const options = {
  scenarios: {
    streams: { executor: 'constant-vus', vus: Number(__ENV.VUS || 50), duration: __ENV.DURATION || '2m' },
  },
  thresholds: {
    assistant_ttft_ms: ['p(95)<2000'],
    http_req_failed: ['rate<0.01'],
    checks: ['rate>0.99'],
    assistant_incomplete_streams: ['count<5'],
  },
}

const MESSAGES = [
  'Do you have a red jamdani saree?',
  'Show me panjabi for Eid under 2000 taka',
  'How long does delivery take outside Dhaka?',
  'লাল জামদানি শাড়ি আছে?',
  'ঢাকার বাইরে ডেলিভারিতে কত দিন লাগে?',
  'Is the power bank in stock?',
]

export default function () {
  const message = MESSAGES[Math.floor(Math.random() * MESSAGES.length)]
  const res = http.post(`${BASE}/api/ai/assistant/chat`, JSON.stringify({ message, locale: /[ঀ-৿]/.test(message) ? 'bn' : 'en' }), {
    headers: {
      'Content-Type': 'application/json',
      Accept: 'text/event-stream',
      // One stable visitor (cookie ids must be 16-64 chars) and one client IP per VU, so per-visitor and
      // per-IP rate limits see 50 separate shoppers rather than one client. X-Forwarded-For is only honoured
      // because the dev server has no proxy in front; never rely on it in production.
      Cookie: `ai_vid=k6-loadtest-visitor-${String(__VU).padStart(4, '0')}`,
      'X-Forwarded-For': `10.0.${Math.floor(__VU / 250)}.${(__VU % 250) + 1}`,
    },
    timeout: '60s',
  })
  ttft.add(res.timings.waiting)
  streamMs.add(res.timings.duration)
  const body = String(res.body || '')
  const done = body.includes('event: done') || body.includes('"type":"done"')
  if (!done) incomplete.add(1)
  check(res, {
    'status 200': (r) => r.status === 200,
    'is SSE': (r) => String(r.headers['Content-Type'] || '').includes('text/event-stream'),
    'stream finished': () => done,
    'no error event': () => !body.includes('event: error'),
  })
  sleep(1 + Math.random() * 2)
}
