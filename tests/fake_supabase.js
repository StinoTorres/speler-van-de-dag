// Lokale testserver: serveert public/ en speelt Supabase na.
// POST /rest/v1/rpc/<fn> roept de functie aan als rol 'anon' in een lokale Postgres (zoals PostgREST doet).
// Gebruik: PGHOST=/tmp/pg PGPORT=5544 PGDATABASE=nl node tests/fake_supabase.js 8790
const http=require('http'), fs=require('fs'), path=require('path'), {execFileSync}=require('child_process');
const root=path.join(__dirname,'..','public'), PORT=+process.argv[2]||8790;
const PG=['-h',process.env.PGHOST||'/tmp/pg','-p',process.env.PGPORT||'5544','-U',process.env.PGUSER||'postgres','-d',process.env.PGDATABASE||'nl'];
const q = s => "'" + String(s).replace(/'/g,"''") + "'";
function psql(sql){ return execFileSync('psql',[...PG,'-At','-v','ON_ERROR_STOP=1','-c',sql],{encoding:'utf8',stdio:['ignore','pipe','pipe']}).trim(); }
const setof = {};
http.createServer((req,res)=>{
  let body=''; req.on('data',c=>body+=c); req.on('end',()=>{
    const u=req.url.split('?')[0];
    if(u.startsWith('/rest/v1/rpc/')){
      const fn=u.slice(13).replace(/[^a-z_]/g,''); const args=body?JSON.parse(body):{};
      const a=Object.entries(args).map(([k,v])=>`${k} => ${v===null?'null':q(v)}`).join(', ');
      if(setof[fn]===undefined) setof[fn] = psql(`select proretset from pg_proc where proname='${fn}'`)==='t';
      const sql = setof[fn] ? `set role anon; select coalesce(json_agg(t),'[]') from public.${fn}(${a}) t;` : `set role anon; select to_json(public.${fn}(${a}));`;
      try{ const out=psql(sql).replace(/^SET\n?/,''); res.writeHead(200,{'content-type':'application/json'}); res.end(out||'null'); }
      catch(e){ const msg=String(e.stderr||e.message).split('\n')[0].replace(/^.*ERROR:\s*/,''); res.writeHead(400,{'content-type':'application/json'}); res.end(JSON.stringify({message:msg})); }
      return;
    }
    if(u==='/config.js'){ res.writeHead(200,{'content-type':'text/javascript'}); return res.end(`window.GAME_CONFIG={supabaseUrl:"http://localhost:${PORT}",supabaseAnonKey:"test",ads:{placeholder:true}};`); }
    let p=decodeURIComponent(u); if(p.endsWith('/')) p+='index.html'; const f=path.join(root,p);
    if(!fs.existsSync(f)){ res.writeHead(404); return res.end(); }
    res.writeHead(200,{'content-type':{'.html':'text/html','.js':'text/javascript','.json':'application/json','.svg':'image/svg+xml','.png':'image/png','.webmanifest':'application/manifest+json','.jpg':'image/jpeg','.txt':'text/plain'}[path.extname(f)]||'text/plain'}); fs.createReadStream(f).pipe(res);
  });
}).listen(PORT, ()=>console.log('fake supabase on', PORT));
