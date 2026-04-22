import 'dotenv/config'

import { createApp } from './app.js'

const port = Number.parseInt(process.env.PORT ?? '3001', 10)

const app = await createApp()
await app.listen({ port, host: '0.0.0.0' })
