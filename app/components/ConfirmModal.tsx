export default function ConfirmModal({
  open,
  title,
  message,
  cancelText = "Go back",
  confirmText = "Confirm",
  onCancel,
  onConfirm,
}: {
  open: boolean;
  title: string;
  message: string;
  cancelText?: string;
  confirmText?: string;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center px-6">
      <div className="absolute inset-0 bg-black/50" onClick={onCancel} aria-hidden="true" />
      <div className="relative w-full max-w-md rounded-3xl border border-gray-300 bg-gray-100 p-6 shadow-lg">
        <h3 className="mb-2 text-lg font-bold text-gray-900">{title}</h3>
        <p className="mb-6 text-sm text-gray-800">{message}</p>

        <div className="flex justify-end gap-3">
          <button
            onClick={onConfirm}
            className="rounded-2xl border px-4 py-2 text-sm font-semibold text-gray-900 transition-colors hover:bg-gray-200"
          >
            {confirmText}
          </button>
          <button
            onClick={onCancel}
            className="rounded-2xl border px-4 py-2 text-sm font-semibold text-gray-900 transition-colors hover:bg-gray-200"
          >
            {cancelText}
          </button>
        </div>
      </div>
    </div>
  );
}
