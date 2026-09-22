import type { InternalRuntimeStore } from '@/lib/control-plane/runtime-store';
export async function buildControlPlaneOperatorSnapshot(store: InternalRuntimeStore) {
  const workflows=store.listWorkflowSnapshots(), tasks=store.listAgentRuntimeTasks(), inbox=store.listCeoInbox(), handoffs=store.listHandoffs(), outbox=store.listOutbox(), jobs=store.listJobs(), commands=store.listCommands(), events=store.listDomainEvents(), consumerReceipts=store.listConsumerDeliveryReceipts(), audit=await store.listAudit(), runtimeRedrives=store.listRuntimeRedrives(), outboxRedrives=store.listDeadLetterRedrives();
  return { workflows,tasks,inbox,handoffs,outbox,jobs,commands,events,consumerReceipts,audit,runtimeRedrives,outboxRedrives, counts:{
    workflows:workflows.length, activeWorkflows:workflows.filter(w=>w.state!=='ARCHIVED').length,
    openTasks:tasks.filter(t=>t.status==='queued'||t.status==='running').length, taskDeadLetters:tasks.filter(t=>t.status==='dead_letter').length,
    ceoPending:inbox.filter(i=>i.status!=='resolved').length, pendingHandoffs:handoffs.filter(h=>h.status==='pending'||h.status==='in_flight').length,
    handoffDeadLetters:handoffs.filter(h=>h.status==='dead_letter').length, pendingOutbox:outbox.filter(m=>m.status==='pending'||m.status==='in_flight').length,
    outboxDeadLetters:outbox.filter(m=>m.status==='dead_letter').length, scheduledJobs:jobs.filter(j=>j.status==='scheduled'||j.status==='running').length,
    jobDeadLetters:jobs.filter(j=>j.status==='dead_letter').length,
  }};
}
