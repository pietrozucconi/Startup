'use server';
import { revalidatePath } from 'next/cache';
import { getControlPlaneRuntimeStore } from '@/lib/control-plane/runtime-data';
function requiredField(formData:FormData,key:string){ const raw=formData.get(key); if(typeof raw!=='string'||!raw.trim()) throw new Error(`operator_action_missing_field:${key}`); return raw.trim(); }
function refresh() {
  [
    '/tasks',
    '/approvals',
    '/workflows',
    '/control-plane',
  ].forEach((path) => {
    revalidatePath(path);
  });
}
export async function acknowledgeCeoInboxAction(formData:FormData){ const inboxId=requiredField(formData,'inboxId'); getControlPlaneRuntimeStore().acknowledgeCeoInboxItem({inboxId,acknowledgedAt:new Date().toISOString()}); refresh(); }
export async function redriveAgentTaskAction(formData:FormData){ const taskId=requiredField(formData,'taskId'), reason=requiredField(formData,'reason'); getControlPlaneRuntimeStore().redriveAgentRuntimeTask({taskId,requestedAt:new Date().toISOString(),reason}); refresh(); }
export async function redriveHandoffAction(formData:FormData){ const handoffId=requiredField(formData,'handoffId'), reason=requiredField(formData,'reason'); getControlPlaneRuntimeStore().redriveHandoff({handoffId,requestedAt:new Date().toISOString(),reason}); refresh(); }
export async function redriveOutboxAction(formData:FormData){ const messageId=requiredField(formData,'messageId'), reason=requiredField(formData,'reason'), now=new Date().toISOString(); getControlPlaneRuntimeStore().redriveDeadLetter({ redriveId:`operator-redrive:${messageId}:${now}`, messageId, requestedBy:{kind:'human',id:'ceo'}, requestedAt:now, reason }, now); refresh(); }
