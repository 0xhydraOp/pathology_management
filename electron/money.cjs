function parseMoney(value){
  if(typeof value!=='string' || value.length>32 || !/^(0|[1-9]\d*)(\.\d{1,2})?$/.test(value))throw new Error('Enter a non-negative amount with at most two decimal places');
  const [whole,fraction='']=value.split('.');const minor=BigInt(whole)*100n+BigInt(fraction.padEnd(2,'0'));
  if(minor>BigInt(Number.MAX_SAFE_INTEGER))throw new Error('Amount is too large');return Number(minor);
}
function add(...values){const n=values.reduce((s,v)=>{if(!Number.isSafeInteger(v))throw new Error('Invalid stored money');return s+BigInt(v);},0n);if(n>BigInt(Number.MAX_SAFE_INTEGER)||n<BigInt(Number.MIN_SAFE_INTEGER))throw new Error('Money total is too large');return Number(n);}
function formatMoney(n){if(!Number.isSafeInteger(n))throw new Error('Invalid stored money');const v=BigInt(n),a=v<0n?-v:v;return `${v<0n?'-':''}${a/100n}.${String(a%100n).padStart(2,'0')}`;}
function legacyMoney(value){if(value==null)return 0;if(typeof value!=='number'||!Number.isFinite(value)||value<0)throw new Error('Invalid legacy bill amount');const n=Math.round(value*100);if(!Number.isSafeInteger(n))throw new Error('Legacy bill is too large');return n;}
function toLegacyAmount(minor){const amount=Number(formatMoney(minor));if(parseMoney(String(amount))!==minor||legacyMoney(amount)!==minor)throw new Error('Amount exceeds precise invoice storage range');return amount;}
function percent(minor,percentage){
 if(!Number.isSafeInteger(minor)||minor<0)throw new Error('Invalid charge');
 const m=typeof percentage==='string'&&/^(\d+)(?:\.(\d+))?(?:e([+-]?\d+))?$/i.exec(percentage);if(!m||percentage.length>400)throw new Error('Invalid percentage');
 const scale=(m[2]||'').length-Number(m[3]||0);if(!Number.isSafeInteger(scale)||Math.abs(scale)>400)throw new Error('Invalid percentage');
 let numerator=BigInt(m[1]+(m[2]||'')),denominator=1n;if(scale<0)numerator*=10n**BigInt(-scale);else denominator=10n**BigInt(scale);
 if(numerator>100n*denominator)throw new Error('Percentage exceeds 100');denominator*=100n;
 const rounded=(BigInt(minor)*numerator+denominator/2n)/denominator;if(rounded>BigInt(Number.MAX_SAFE_INTEGER))throw new Error('Amount is too large');return Number(rounded);
}
module.exports={parseMoney,formatMoney,legacyMoney,toLegacyAmount,add,percent};
