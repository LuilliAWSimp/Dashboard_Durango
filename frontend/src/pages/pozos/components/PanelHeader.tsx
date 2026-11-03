interface PanelHeaderProps {
  title: string;
  subtitle?: string;
  eyebrow?: string;
}

function PanelHeader({ title, subtitle, eyebrow }: PanelHeaderProps) {
  return (
    <div className="panel-header compact">
      <div>
        {eyebrow ? <div className="panel-eyebrow">{eyebrow}</div> : null}
        <div className="panel-title">{title}</div>
        {subtitle ? <div className="panel-subtitle">{subtitle}</div> : null}
      </div>
    </div>
  );
}

export default PanelHeader;
