import { Prisma } from '@prisma/client'
import type { FastifyInstance } from 'fastify'
import {
  hasZodFastifySchemaValidationErrors,
  isResponseSerializationError,
} from 'fastify-type-provider-zod'

import { HttpError } from '../utils/httpError.js'

function errorBody(code: string, message: string, details?: unknown) {
  if (details !== undefined) {
    return { error: { code, message, details } }
  }
  return { error: { code, message } }
}

const INTERNAL_MESSAGE = 'Internal server error'

function summarizeValidationDetails(error: unknown): { fields: Array<{ path: string; message: string }> } {
  if (!hasZodFastifySchemaValidationErrors(error)) {
    return { fields: [{ path: 'body', message: 'Invalid request payload' }] }
  }
  const raw = (error as { validation?: unknown }).validation
  if (!Array.isArray(raw) || raw.length === 0) {
    return { fields: [{ path: 'body', message: 'Invalid request payload' }] }
  }
  const fields = raw.slice(0, 30).map((item: unknown) => {
    if (typeof item !== 'object' || item === null) {
      return { path: 'body', message: 'invalid' }
    }
    const rec = item as Record<string, unknown>
    const instancePath = typeof rec.instancePath === 'string' ? rec.instancePath.replace(/^\//, '') : ''
    const path = instancePath || (typeof rec.schemaPath === 'string' ? String(rec.schemaPath) : 'body')
    const message = typeof rec.message === 'string' ? rec.message : 'invalid'
    return { path: path || 'body', message }
  })
  return { fields }
}

export function attachErrorHandlers(app: FastifyInstance): void {
  app.setErrorHandler((error, request, reply) => {
    if (error instanceof HttpError) {
      return reply.status(error.statusCode).send(errorBody(error.code, error.message, error.details))
    }

    if (hasZodFastifySchemaValidationErrors(error)) {
      const details = summarizeValidationDetails(error)
      return reply.status(400).send(errorBody('INVALID_REQUEST', 'Invalid request payload', details))
    }

    if (isResponseSerializationError(error)) {
      request.server.log.error({ err: error }, '[zod serialize]')
      return reply.status(500).send(errorBody('INTERNAL_ERROR', INTERNAL_MESSAGE))
    }

    if (error instanceof Prisma.PrismaClientKnownRequestError) {
      request.server.log.error({ err: error }, '[prisma]')
      return reply.status(500).send(errorBody('INTERNAL_ERROR', INTERNAL_MESSAGE))
    }

    if (error instanceof Prisma.PrismaClientValidationError) {
      request.server.log.error({ err: error }, '[prisma validation]')
      return reply.status(500).send(errorBody('INTERNAL_ERROR', INTERNAL_MESSAGE))
    }

    const code = (error as { code?: string }).code
    if (code === 'FST_ERR_CTP_INVALID_JSON_BODY' || code === 'FST_ERR_INVALID_JSON') {
      return reply.status(400).send(errorBody('INVALID_REQUEST', 'Invalid JSON body'))
    }

    request.server.log.error({ err: error }, '[unhandled]')
    return reply.status(500).send(errorBody('INTERNAL_ERROR', INTERNAL_MESSAGE))
  })
}
