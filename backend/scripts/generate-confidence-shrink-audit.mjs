import { generateConfidenceShrinkAudit } from '../dist/scripts/generateConfidenceShrinkAudit.js'

const result = await generateConfidenceShrinkAudit()
console.log(JSON.stringify(result, null, 2))
