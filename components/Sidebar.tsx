import Link from 'next/link';

const Sidebar = () => {
  return (
    <div className="fixed inset-y-0 left-0 w-64 bg-white border-r border-gray-200">
      <div className="py-4 px-3">
        <ul>
          <li>
            <Link href="/dashboard">
              <a className="block px-4 py-2 text-gray-700 hover:bg-gray-100">Dashboard</a>
            </Link>
          </li>
          <li>
            <a href="/dashboard/reports" className="block px-4 py-2 text-gray-700 hover:bg-gray-100">Reportes & Finanzas</a>
          </li>
          {/* Otras secciones del sidebar */}
        </ul>
      </div>
    </div>
  );
};

export default Sidebar;