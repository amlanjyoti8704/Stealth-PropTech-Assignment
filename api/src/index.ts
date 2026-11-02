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
    const billId=c.req.param('billId');
    const shareId=c.req.param('shareId');
    const idempotencyKey=c.req.header('Idempotency-Key')?.trim();
    
    if(!idempotencyKey){
        return c.json({
            error:'Missing Idempotency-Key header'
        },400);
    }

    try{
        const bill=await c.env.DB.prepare(
            'SELECT * FROM bills WHERE id=?'
        ).bind(billId)
        .first();

        if(!bill){
            return c.json({
                error: 'Bill not found'
            },404);
        }

        const share=await c.env.DB.prepare(
            'SELECT * FROM shares WHERE id=? AND bill_id=?'
        ).bind(shareId,billId)
        .first<{
            id: string;
            bill_id: string;
            member_id:string;
            amount_cents:number;
            paid_at:string | null;
            idempotency_key:string | null;
        }>();

        if(!share){
            return c.json({
                error: 'Share not found'
            },404);
        }

        if(share.paid_at!==null){
            if(share.idempotency_key===idempotencyKey){
                return c.json({
                    id:share.id,
                    memberId:share.member_id,
                    amountCents:share.amount_cents,
                    paidAt:share.paid_at
                },200);
            }
            return c.json({
                error: 'Share already paid with a different key'
            },409);
        }

        const paidAt=new Date().toISOString();

        const updateResult=await c.env.DB.prepare(
            'UPDATE shares SET paid_at=?, idempotency_key=? WHERE id=? AND bill_id=? AND paid_at IS NULL'
        ).bind(paidAt,idempotencyKey, shareId, billId)
        .run();

        if(updateResult.meta.changes===0){
            const refreshed=await c.env.DB.prepare(
                'SELECT * FROM shares WHERE id=?'
            ).bind(shareId)
            .first<{
                id: string
                member_id:string
                amount_cents:number;
                paid_at:string | null;
                idempotency_key:string | null;
            }>();

            if(refreshed && refreshed.idempotency_key===idempotencyKey){
                return c.json({
                    id:refreshed.id,
                    memberId:refreshed.member_id,
                    amountCents:refreshed.amount_cents,
                    paidAt:refreshed.paid_at
                },200);
            }
            return c.json({
                error: 'Share already paid with a different key'
            },409);
        }

        return c.json({
            id:share.id,
            memberId:share.member_id,
            amountCents: share.amount_cents,
            paidAt,
        },200);

    }catch(error){
        console.error(error);
        return c.json({
            error:'Unexpected error'
        },500);
    }
})

app.get('/api/homes/:id/balances', async(c)=>{
    const homeId=c.req.param('id');
    try{
        const home=await c.env.DB.prepare(
            'SELECT id FROM homes WHERE id=?'
        ).bind(homeId)
        .first();

        if(!home){
            return c.json({
                error: 'Home not found'
            },404);
        }

        const { results } =await c.env.DB.prepare(
            `SELECT m.id AS memberId, m.name, COALESCE(SUM(s.amount_cents),0) AS outstandingCents FROM members m LEFT JOIN shares s ON s.member_id=m.id AND s.paid_at IS NULL WHERE m.home_id=? GROUP BY m.id, m.name, m.created_at ORDER BY m.created_at ASC`
        ).bind(homeId)
        .all<{
            memberId:string;
            name:string;
            outstandingCents:number;
        }>();

        return c.json({
            balances:results??[]
        },200);
    }catch(error){
        console.error(error);
        return c.json({
            error:'Unexpected error'
        },500);
    }
})

export default app
