import { useEffect, useState } from 'react';
import { Download } from 'lucide-react';

export function UpdateNotification() {
  const [updateAvailable, setUpdateAvailable] = useState(false);
  const [updateVersion, setUpdateVersion] = useState<string>('');
  const [downloading, setDownloading] = useState(false);
  const [updateReady, setUpdateReady] = useState(false);

  useEffect(() => {
    if (!window.horsebet) return;

    window.horsebet.onUpdateAvailable((version) => {
      setUpdateAvailable(true);
      setUpdateVersion(version);
    });

    window.horsebet.onUpdateDownloaded(() => {
      setDownloading(false);
      setUpdateReady(true);
    });

    window.horsebet.onUpdateError((error) => {
      console.error('Update error:', error);
      setDownloading(false);
    });
  }, []);

  const handleDownload = async () => {
    if (!window.horsebet) return;
    setDownloading(true);
    await window.horsebet.downloadUpdate();
  };

  const handleInstall = async () => {
    if (!window.horsebet) return;
    await window.horsebet.installUpdate();
  };

  if (!updateAvailable) return null;

  return (
    <div className="fixed bottom-4 right-4 bg-blue-600 text-white p-4 rounded-lg shadow-lg max-w-sm z-50">
      {updateReady ? (
        <>
          <h3 className="font-bold mb-2">アップデート準備完了</h3>
          <p className="text-sm mb-3">
            バージョン {updateVersion} がダウンロードされました。
            アプリを再起動してインストールします。
          </p>
          <button
            onClick={handleInstall}
            className="w-full bg-white text-blue-600 px-4 py-2 rounded hover:bg-gray-100 font-medium"
          >
            再起動してインストール
          </button>
        </>
      ) : (
        <>
          <h3 className="font-bold mb-2">新しいバージョンが利用可能</h3>
          <p className="text-sm mb-3">
            バージョン {updateVersion} がリリースされました。
          </p>
          <button
            onClick={handleDownload}
            disabled={downloading}
            className="w-full bg-white text-blue-600 px-4 py-2 rounded hover:bg-gray-100 font-medium flex items-center justify-center gap-2 disabled:opacity-50"
          >
            <Download size={16} />
            {downloading ? 'ダウンロード中...' : 'ダウンロード'}
          </button>
        </>
      )}
    </div>
  );
}
