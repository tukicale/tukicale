export default function TermsPage() {
  return (
    <div className="max-w-4xl mx-auto p-6 bg-white dark:bg-gray-900 min-h-screen">
      <h1 className="text-3xl font-bold mb-6 text-gray-900 dark:text-gray-100">利用規約</h1>
      
      <div className="space-y-6 text-gray-700 dark:text-gray-300">
        <section>
          <h2 className="text-xl font-semibold mb-3 text-gray-900 dark:text-gray-100">第1条（適用）</h2>
          <p>本規約は、TukiCale運営チーム（以下「当チーム」）が提供する生理管理アプリ「TukiCale」（以下「本サービス」）の利用条件を定めるものです。ユーザーは本規約に同意した上で本サービスを利用するものとします。</p>
        </section>

        <section>
          <h2 className="text-xl font-semibold mb-3 text-gray-900 dark:text-gray-100">第2条（サービス内容）</h2>
          <p>本サービスは、生理周期の記録・管理を支援するためのアプリケーションです。予測機能はあくまで参考情報であり、医療行為ではありません。</p>
        </section>

        <section>
          <h2 className="text-xl font-semibold mb-3 text-gray-900 dark:text-gray-100">第3条（利用資格）</h2>
          <p>本サービスは、Googleアカウントを保有するすべての方がご利用いただけます。未成年者が利用する場合は、保護者の方と相談の上でご利用ください。</p>
        </section>

        <section>
          <h2 className="text-xl font-semibold mb-3 text-gray-900 dark:text-gray-100">第4条（禁止事項）</h2>
          <ul className="list-disc ml-6 space-y-1">
            <li>法令または公序良俗に違反する行為</li>
            <li>犯罪行為に関連する行為</li>
            <li>本サービスの運営を妨害する行為</li>
            <li>他のユーザーに迷惑をかける行為</li>
            <li>不正アクセスまたはこれを試みる行為</li>
          </ul>
        </section>

        <section>
          <h2 className="text-xl font-semibold mb-3 text-gray-900 dark:text-gray-100">第5条（免責事項）</h2>
          <ul className="list-disc ml-6 space-y-1">
            <li>本サービスの予測機能は参考情報であり、正確性を保証するものではありません</li>
            <li>本サービスは医療行為ではなく、診断・治療の代替とはなりません</li>
            <li>本サービスの利用により生じた損害について、当チームは一切の責任を負いません</li>
            <li>システム障害等により一時的にサービスが利用できない場合があります</li>
          </ul>
        </section>

        <section>
          <h2 className="text-xl font-semibold mb-3 text-gray-900 dark:text-gray-100">第6条（サービスの変更・終了）</h2>
          <p>当チームは、ユーザーへの事前通知なく、本サービスの内容を変更または終了することができるものとします。</p>
        </section>

        <section>
          <h2 className="text-xl font-semibold mb-3 text-gray-900 dark:text-gray-100">第7条（お問い合わせ）</h2>
          <p className="mb-2">本サービスに関するお問い合わせは、TikTok（<a href="https://www.tiktok.com/@tukicale_app" target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline">@tukicale_app</a>）のコメント欄よりお願いいたします。</p>
        </section>

        <p className="mt-8 text-gray-600 dark:text-gray-400">最終更新日：2025年10月13日</p>
      </div>

      <div className="mt-8">
        <a href="/" className="text-blue-600 hover:underline">← トップページに戻る</a>
      </div>
    </div>
  );
}