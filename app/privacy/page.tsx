import Link from 'next/link';

export default function PrivacyPage() {
  return (
    <div className="max-w-4xl mx-auto p-6 bg-white dark:bg-gray-900 min-h-screen">
      <h1 className="text-3xl font-bold mb-6 text-gray-900 dark:text-gray-100">プライバシーポリシー</h1>
      
      <div className="space-y-6 text-gray-700 dark:text-gray-300">
        <section>
          <h2 className="text-xl font-semibold mb-3 text-gray-900 dark:text-gray-100">1. 収集する情報</h2>
          <p className="mb-2">本サービスでは、以下の情報を収集します：</p>
          <ul className="list-disc ml-6 space-y-1">
            <li>生理開始日・終了日</li>
            <li>性行為の記録（避妊具使用状況、パートナー情報、メモ）</li>
            <li>Googleアカウント情報（メールアドレス、プロフィール情報）</li>
          </ul>
        </section>

        <section>
          <h2 className="text-xl font-semibold mb-3 text-gray-900 dark:text-gray-100">2. 情報の利用目的</h2>
          <p className="mb-2">収集した情報は、以下の目的で利用します：</p>
          <ul className="list-disc ml-6 space-y-1">
            <li>生理周期の記録・管理</li>
            <li>妊娠可能日・PMS予測の提供</li>
            <li>Googleカレンダーへの同期</li>
            <li>サービスの改善</li>
          </ul>
        </section>

        <section>
          <h2 className="text-xl font-semibold mb-3 text-gray-900 dark:text-gray-100">3. 情報の保存場所</h2>
          <p>すべてのデータは、ユーザーのGoogleドライブに保存されます。当チームのサーバーには保存されません。</p>
        </section>

        <section>
          <h2 className="text-xl font-semibold mb-3 text-gray-900 dark:text-gray-100">4. 第三者への提供</h2>
          <p className="mb-2">当チームは、ユーザーの個人情報を第三者に提供することはありません。ただし、以下の場合を除きます：</p>
          <ul className="list-disc ml-6 space-y-1">
            <li>ユーザーの同意がある場合</li>
            <li>法令に基づく場合</li>
          </ul>
        </section>

        <section>
          <h2 className="text-xl font-semibold mb-3 text-gray-900 dark:text-gray-100">5. Google APIの利用</h2>
          <p>本サービスは、Google Drive APIおよびGoogle Calendar APIを利用しています。これらのAPIを通じて取得した情報は、本サービスの提供目的以外には使用しません。</p>
        </section>

        <section>
          <h2 className="text-xl font-semibold mb-3 text-gray-900 dark:text-gray-100">6. データの削除</h2>
          <p>ユーザーは、設定画面から「すべてのデータを削除」を実行することで、アプリ内のすべてのデータを削除できます。Googleドライブ上のデータは、Google Driveから直接削除してください。</p>
        </section>

        <section>
          <h2 className="text-xl font-semibold mb-3 text-gray-900 dark:text-gray-100">7. セキュリティ</h2>
          <p>当チームは、個人情報の漏洩、滅失または毀損の防止に努めます。ただし、完全な安全性を保証するものではありません。</p>
        </section>

        <section>
          <h2 className="text-xl font-semibold mb-3 text-gray-900 dark:text-gray-100">8. 未成年者の利用</h2>
          <p>未成年者が本サービスを利用する場合は、保護者の方と相談の上でご利用ください。</p>
        </section>

        <section>
          <h2 className="text-xl font-semibold mb-3 text-gray-900 dark:text-gray-100">9. お問い合わせ</h2>
          <p className="mb-2">本ポリシーに関するお問い合わせは、以下までお願いいたします：</p>
          <p>TikTok: <a href="https://www.tiktok.com/@tukicale_app" target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline">@tukicale_app</a>のコメント欄</p>
        </section>

        <section>
          <h2 className="text-xl font-semibold mb-3 text-gray-900 dark:text-gray-100">10. プライバシーポリシーの変更</h2>
          <p>当チームは、本ポリシーを予告なく変更することがあります。変更後のポリシーは、本アプリ上に掲載した時点で効力を生じるものとします。</p>
        </section>

        <p className="mt-8 text-gray-600 dark:text-gray-400">最終更新日：2025年10月13日</p>
      </div>

      <div className="mt-8">
        <Link href="/" className="text-blue-600 hover:underline">← トップページに戻る</Link>
      </div>
    </div>
  );
}