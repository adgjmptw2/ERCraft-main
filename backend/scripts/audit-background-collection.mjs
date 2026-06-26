import { auditBackgroundCollection } from '../dist/scripts/auditBackgroundCollection.js'

const result = await auditBackgroundCollection()
console.log(JSON.stringify(result, null, 2))

