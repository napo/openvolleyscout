export type LiveStageLayoutInput = {
  activeStage: string;
  hasManageActionPanel: boolean;
};

export function shouldRenderDeadBallEventsPanel({
  activeStage,
  hasManageActionPanel,
}: LiveStageLayoutInput): boolean {
  return activeStage === 'live_rally' && hasManageActionPanel;
}

export function shouldRenderCourtFirstLiveRally({
  activeStage,
  hasManageActionPanel,
}: LiveStageLayoutInput): boolean {
  return activeStage === 'live_rally' && !hasManageActionPanel;
}
