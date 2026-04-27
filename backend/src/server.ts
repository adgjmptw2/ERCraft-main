import 'dotenv/config'

import { createApp } from './app.js'
import { config } from './config/env.js'

if (!config.databaseUrl) {
  throw new Error('DATABASE_URL is required')
}

const app = await createApp()
await app.listen({ port: config.port, host: '0.0.0.0' })
