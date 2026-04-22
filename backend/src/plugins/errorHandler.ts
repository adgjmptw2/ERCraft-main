import { Prisma } from '@prisma/client'
import type { FastifyInstance } from 'fastify'

import { HttpError } from '../utils/httpError.js'

function errorBody(code: string, message: string, details?: unknown) {
  if (details !== undefined) {
    return { error: { code, message, details } }
  }
  return { error: { code, message } }
}

export function attachErrorHandlers(app: FastifyInstance): void {
  app.setNotFoundHandler((_request, reply) => {
    void reply.status(404).send(errorBody('NOT_FOUND', 'Resource not found'))
  })

  app.setErrorHandler((error, _request, reply) => {
    if (error instanceof HttpError) {
      return reply.status(error.statusCode).send(errorBody(error.code, error.message, error.details))
    }

    if (error instanceof Prisma.PrismaClientKnownRequestError) {
      console.error('[prisma]', error.code, error.message)
      return reply.status(500).send(errorBody('INTERNAL_ERROR', 'Something went wrong'))
    }

    if (error instanceof Prisma.PrismaClientValidationError) {
      console.error('[prisma validation]', error.message)
      return reply.status(500).send(errorBody('INTERNAL_ERROR', 'Something went wrong'))
    }

    const code = (error as { code?: string }).code
    if (code === 'FST_ERR_CTP_INVALID_JSON_BODY' || code === 'FST_ERR_INVALID_JSON') {
      return reply.status(400).send(errorBody('INVALID_REQUEST', 'Invalid JSON body'))
    }

    console.error('[unhandled]', error)
    return reply.status(500).send(errorBody('INTERNAL_ERROR', 'Something went wrong'))
  })
}
