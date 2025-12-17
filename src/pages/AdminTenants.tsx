import AdminLayout from "@/components/AdminLayout";
import TenantManager from "@/components/admin/TenantManager";
import { useTenant } from "@/hooks/useTenant";
import { Navigate } from "react-router-dom";

const AdminTenants = () => {
  const { isPlatformAdmin, isLoading } = useTenant();

  if (isLoading) {
    return (
      <AdminLayout title="Tenant Management" subtitle="Create and manage tenant instances">
        <div className="flex items-center justify-center h-64">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
        </div>
      </AdminLayout>
    );
  }

  // Only platform admins can access this page
  if (!isPlatformAdmin) {
    return <Navigate to="/app" replace />;
  }

  return (
    <AdminLayout title="Tenant Management" subtitle="Create and manage tenant instances">
      <TenantManager />
    </AdminLayout>
  );
};

export default AdminTenants;
