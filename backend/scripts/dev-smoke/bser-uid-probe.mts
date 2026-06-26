import 'dotenv/config'
import { BserClient } from '../../src/external/bserClient.ts'
const bser = new BserClient(process.env.BSER_API_KEY ?? '')
const user = await bser.getUserByNickname('하잉')
console.log('bser haying', user)
const mine = await bser.getUserByNickname('마인')
console.log('bser mine', mine)