export type PanelTarget = 'dash-to-panel' | 'main';

export interface DashToPanelEntry<TPanel> {
  geom?: {
    position?: number;
  };
  isPrimary?: boolean;
  panel: TPanel;
}

export interface DashToPanelState<TPanel> {
  panels?: DashToPanelEntry<TPanel>[];
}

export interface ResolvedPanel<TPanel> {
  entry?: DashToPanelEntry<TPanel>;
  panel: TPanel;
  target: PanelTarget;
}

export function resolvePanel<TPanel>(
  mainPanel: TPanel,
  dashToPanel: DashToPanelState<TPanel> | null | undefined,
  requestedTarget: PanelTarget,
  requiredPosition?: number,
): ResolvedPanel<TPanel> {
  if (requestedTarget === 'dash-to-panel') {
    const panels = dashToPanel?.panels?.filter(entry =>
      Boolean(entry?.panel) && (
        requiredPosition === undefined ||
        entry.geom?.position === requiredPosition
      ));
    const targetPanel = panels?.find(entry => entry.isPrimary) ?? panels?.[0];
    if (targetPanel) {
      return {
        entry: targetPanel,
        panel: targetPanel.panel,
        target: 'dash-to-panel',
      };
    }
  }

  return {
    panel: mainPanel,
    target: 'main',
  };
}
