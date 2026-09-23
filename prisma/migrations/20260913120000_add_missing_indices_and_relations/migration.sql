-- CreateIndex
CREATE INDEX "AgentTask_approvedByUserId_idx" ON "AgentTask"("approvedByUserId");

-- CreateIndex
CREATE INDEX "CashMovement_userId_idx" ON "CashMovement"("userId");

-- CreateIndex
CREATE INDEX "TicketSale_companyId_ticketTypeId_idx" ON "TicketSale"("companyId", "ticketTypeId");

-- CreateIndex
CREATE INDEX "VoteOrder_companyId_candidateId_paymentStatus_idx" ON "VoteOrder"("companyId", "candidateId", "paymentStatus");

-- AddForeignKey
ALTER TABLE "CashMovement" ADD CONSTRAINT "CashMovement_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AgentTask" ADD CONSTRAINT "AgentTask_approvedByUserId_fkey" FOREIGN KEY ("approvedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
