export default function NoAccessPage() {
  return (
    <div className="min-h-[60vh] flex items-center justify-center p-6">
      <div className="max-w-md rounded-3xl border border-slate-200 bg-white p-8 text-center shadow-sm">
        <div className="text-xl font-semibold text-slate-900">No accessible pages</div>
        <p className="mt-3 text-sm text-slate-600">
          Your role does not have access to any app page on this device. Ask an administrator to update your role
          permissions.
        </p>
      </div>
    </div>
  );
}
