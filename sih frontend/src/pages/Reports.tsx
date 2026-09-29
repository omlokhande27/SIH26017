import { PageHeader } from '@/components/ui/page-header';
import { FileText } from 'lucide-react';

export default function Reports() {
  return (
    <div className="animate-fade-in h-full flex flex-col">
      <PageHeader 
        title="Reports" 
        description="Generate and download statutory reports" 
      />
      <div className="flex-1 flex flex-col items-center justify-center text-center p-8 mt-6 border-2 border-dashed border-gray-200 rounded-xl bg-gray-50/50">
        <FileText className="h-16 w-16 text-gray-300 mb-4" />
        <h3 className="text-xl font-medium text-gray-900 mb-2">Report Generator</h3>
        <p className="text-gray-500 max-w-md">PDF and Excel export capabilities are being integrated.</p>
      </div>
    </div>
  );
}
