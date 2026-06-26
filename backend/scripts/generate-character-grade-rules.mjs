#!/usr/bin/env node
import { mkdir, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

import {
  assertCharacterGradeRulesMatchConfig,
  buildCharacterGradeRulesDocument,
  formatCharacterGradeRulesCsv,
  formatCharacterGradeRulesMarkdown,
} from '../dist/audit/characterGradeRulesDoc.js'

const __dirname = dirname(fileURLToPath(import.meta.url))
const backendRoot = join(__dirname, '..')
const repoRoot = join(backendRoot, '..')

async function main() {
  const document = buildCharacterGradeRulesDocument()
  assertCharacterGradeRulesMatchConfig(document)

  const mdPath = join(repoRoot, 'docs', 'CHARACTER_GRADE_RULES.md')
  const csvPath = join(backendRoot, 'tmp', 'character-grade-rules.csv')
  const jsonPath = join(backendRoot, 'tmp', 'character-grade-rules.json')

  await mkdir(dirname(mdPath), { recursive: true })
  await mkdir(dirname(csvPath), { recursive: true })

  await writeFile(mdPath, formatCharacterGradeRulesMarkdown(document))
  await writeFile(csvPath, formatCharacterGradeRulesCsv(document))
  await writeFile(jsonPath, `${JSON.stringify(document, null, 2)}\n`)

  console.log(
    JSON.stringify(
      {
        mdPath,
        csvPath,
        jsonPath,
        canonicalCombinationCount: document.canonicalCombinationCount,
        supportCanonicalCount: document.supportCanonicalCount,
        utilitySupportCanonicalCount: document.utilitySupportCanonicalCount,
        healerCanonicalCount: document.healerCanonicalCount,
      },
      null,
      2,
    ),
  )
}

main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
