import { collect, currentMonth } from './collector.ts';
import { getSources, getReports, db } from './db.ts';
const months=process.argv.slice(2);await Promise.all((months.length?months:[currentMonth()]).map(month=>collect(month)));
console.log(JSON.stringify({reports:getReports().length,sources:getSources().map(s=>({name:s.name,status:s.status,count:s.fetchedCount,error:s.error}))},null,2));
db.close();
