import { ShieldAlert } from "lucide-react";

interface AgeGateProps {
  onConfirm: () => void;
}

export function AgeGate({ onConfirm }: AgeGateProps) {
  return (
    <div className="age-gate" role="dialog" aria-modal="true" aria-labelledby="age-title">
      <div className="age-gate-card">
        <span className="age-gate-kicker">
          <ShieldAlert size={13} />
          CONTENT NOTICE
        </span>
        <h2 id="age-title">成人向内容提示</h2>
        <p>
          asmr.one 的作品包含 R15 与成人向音声。继续前请确认你已满 18 岁，并遵守作品授权与站点条款。
        </p>
        <div className="age-gate-actions">
          <button className="primary-button" onClick={onConfirm}>
            我已满 18 岁，继续
          </button>
          <a
            className="ghost-button"
            href="https://asmr.one/works"
            target="_blank"
            rel="noreferrer"
          >
            离开
          </a>
        </div>
        <small>
          离线缓存仅限个人收听，请勿传播。作品版权归原作者与社团所有。
        </small>
      </div>
    </div>
  );
}
