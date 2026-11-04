import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getCurrentUser } from '@/lib/auth';
import { getCellarData } from '@/lib/cellar';
import { serializableTransaction } from '@/lib/transaction';
import { jsonError, requestIsSameOrigin } from '@/lib/request';
const schema=z.discriminatedUnion('action',[z.object({action:z.literal('delete'),id:z.string().min(1)}),z.object({action:z.literal('reorder'),ids:z.array(z.string().min(1)).max(1000)})]);
export async function POST(request:NextRequest){
 if(!requestIsSameOrigin(request))return jsonError('Requête refusée.',403);
 const user=await getCurrentUser();if(!user)return jsonError('Connexion requise.',401);
 try{const input=schema.parse(await request.json());await serializableTransaction(async tx=>{
 await tx.$queryRaw`SELECT id FROM "User" WHERE id=${user.id} FOR UPDATE`;
 const categories=await tx.category.findMany({where:{userId:user.id},select:{id:true}});
 if(input.action==='delete'){
 if(!categories.some(c=>c.id===input.id))throw new Error('STALE');
 await tx.stockMovement.deleteMany({where:{userId:user.id,wine:{categoryId:input.id}}});
 await tx.category.delete({where:{id:input.id}});
 }else{
 if(input.ids.length!==categories.length||new Set(input.ids).size!==input.ids.length||categories.some(c=>!input.ids.includes(c.id)))throw new Error('STALE');
 for(const [position,id] of input.ids.entries())await tx.category.update({where:{id},data:{position}});
 }
 });return NextResponse.json({data:await getCellarData(user.id)});
 }catch(error){if(error instanceof z.ZodError)return jsonError('Demande invalide.',400);if(error instanceof Error&&error.message==='STALE')return jsonError('Les catégories ont changé. Rechargez la page.',409);console.error('Gestion catégories impossible');return jsonError('Impossible de modifier les catégories.',500);}
}
