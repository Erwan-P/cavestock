import { CircleCheck } from "lucide-react";

export function AuthStory({ isLogin = false }: { isLogin?: boolean }) {
  return (
    <div className="auth-story">
      <h1>{isLogin ? <>Heureux de vous<br /><em>retrouver.</em></> : <>Une belle cave<br /><em>commence ici.</em></>}</h1>
      {!isLogin && <div className="auth-story__points">
        <span><CircleCheck size={17} /> Votre collection au même endroit</span>
        <span><CircleCheck size={17} /> Un historique clair de vos bouteilles</span>
        <span><CircleCheck size={17} /> Un espace rien qu&apos;à vous</span>
      </div>}
    </div>
  );
}
