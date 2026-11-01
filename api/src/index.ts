import { Hono } from 'hono'

const app = new Hono<{ Bindings: Env }>()

app.get('/api/health', (c) => c.json({ status: 'ok' }))

app.post('/api/homes', async(c)=>{
    const body = await c.req.json<{name?:unknown}>().catch(()=>null)
    if(!body || typeof body.name !== 'string' || body.name.trim() === ''){
        return c.json({
            error:'Name is required'
        }, 400)
    }
    const id=crypto.randomUUID();
    const createdAt=new Date().toISOString();
    const name=body.name.trim();
    try {
        await c.env.DB.prepare(
            'INSERT INTO homes (id, name, created_at) VALUES (?,?,?)'
        ).bind(
            id,
            name,
            createdAt
        ).run();
        return c.json({id,name}, 201);

    } catch (error) {
        console.error(error);
        return c.json({
            error: 'Unexpected error'
        }, 500);
    }
});

app.post('/api/homes/:id/members', async(c)=>{
    const homeId=c.req.param('id');
    const body= await c.req.json<{name?: unknown}>().catch(()=>null);
    if(!body || typeof body.name !=='string' || body.name.trim()===''){
        return c.json({
            error:"Name is required"
        },400)
    }
    try{
        const home=await c.env.DB.prepare(
            'SELECT id from homes where id = ?'
        ).bind(homeId)
        .first();

        if(!home){
            return c.json({error:'Home not found'},404);
        }

        const id=crypto.randomUUID();
        const createdAt=new Date().toISOString();
        const name=body.name.trim();

        await c.env.DB.prepare(
            'INSERT INTO members (id, home_id, name, created_at) VALUES (?,?,?,?)'
        ).bind(id,homeId,name,createdAt)
        .run();
        return c.json({id,homeId,name},201);

    }catch(error){
        console.error(error);
        return c.json({
            error:'Unexpected error'
        },500);
    }
})

app.post('/api/homes/:id/bills', async (c) => {
    const homeId=c.req.param('id');
    const body=await c.req.json<{title?:unknown, totalCents?:unknown}>().catch(()=>null);
    if(!body || typeof body.title !=='string' || body.title.trim()===''){
        return c.json({error: 'Title is required'}, 422);
    }
    if(!body || typeof body.totalCents !== 'number' || !Number.isInteger(body.totalCents) || body.totalCents<=0){
        return c.json({error:'totalCents must be a positive whole number'},422)
    }
    try{
        const home=await c.env.DB.prepare(
            'SELECT id FROM homes WHERE id=?'
        ).bind(homeId)
        .first()

        if(!home){
            return c.json({error:'Home not found'},404);
        }
        const {results:members}=await c.env.DB.prepare(
            'SELECT id FROM members WHERE home_id=? ORDER BY created_at ASC'
        ).bind(homeId)
        .all<{id:string}>()

        if(!members || members.length===0){
            return c.json({error:'Home has no members'},422);
        }

        const totalCents=body.totalCents;
        const title=body.title.trim();
        const createdAt=new Date().toISOString();
        const billId=crypto.randomUUID();

        const baseAmount=Math.floor(totalCents / members.length);
        const remainder=totalCents%members.length;

        const shares=members.map((member,index)=>{
            const amountCents=index<remainder?baseAmount+1:baseAmount;
            return {
                id:crypto.randomUUID(),
                memberId:member.id,
                amountCents,
                paidAt:null,
            }
        })

        const statements=[c.env.DB.prepare(
                'INSERT INTO bills (id,home_id,title,total_cents,created_at) VALUES (?,?,?,?,?)',
            ).bind(billId,homeId,title,totalCents,createdAt),
            ...shares.map((share)=>
                c.env.DB.prepare(
                    'INSERT INTO shares (id,bill_id,member_id,amount_cents,paid_at, idempotency_key) VALUES (?,?,?,?,NULL,NULL)'
                ).bind(share.id, billId, share.memberId, share.amountCents),
            ),
        ];
        await c.env.DB.batch(statements);
        return c.json({id:billId,homeId,title,totalCents,shares},201);
        
    }catch(error){
        console.error(error);
        return c.json({
            error:'Unexpected error'
        },500);
    }
})

app.post('/api/bills/:billId/shares/:shareId/pay', async (c) => {

})

app.get('/api/homes/:id/balance', async(c)=>{

})

export default app
