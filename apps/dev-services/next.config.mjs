import { withPayload } from '@payloadcms/next/withPayload'

/** Workspace packages ship TypeScript source, so Next must transpile them. */
const suitePackages = [
  'ai-core',
  'ai-adapters',
  'ai-content',
  'ai-search',
  'ai-assistant',
  'ai-marketing',
  'ai-support',
  'ai-channels',
  'ai-insights',
  'ai-media',
  'ai-copilot',
  'ai-react',
  'ai-suite',
].map((p) => `@payload-ai-suite/${p}`)

/** @type {import('next').NextConfig} */
const nextConfig = {
  transpilePackages: suitePackages,
  images: { remotePatterns: [{ protocol: 'http', hostname: 'localhost' }] },
}

export default withPayload(nextConfig, { devBundleServerPackages: false })
