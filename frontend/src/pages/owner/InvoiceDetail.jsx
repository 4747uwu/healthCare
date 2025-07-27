import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { toast } from 'react-hot-toast';
import api from '../../services/api';

const InvoiceDetail = () => {
    const { invoiceId } = useParams();
    const navigate = useNavigate();
    
    const [invoice, setInvoice] = useState(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        fetchInvoiceDetail();
    }, [invoiceId]);

    const fetchInvoiceDetail = async () => {
        try {
            setLoading(true);
            // This endpoint would need to be added to the backend
            const response = await api.get(`/owner/invoices/${invoiceId}`);
            
            if (response.data.success) {
                setInvoice(response.data.data);
            }
        } catch (error) {
            console.error('Error fetching invoice detail:', error);
            toast.error('Failed to fetch invoice details');
        } finally {
            setLoading(false);
        }
    };

    const downloadReceipt = async () => {
        try {
            const response = await api.get(`/owner/invoices/${invoiceId}/receipt`, {
                responseType: 'blob'
            });

            const blob = new Blob([response.data], { type: 'application/pdf' });
            const url = window.URL.createObjectURL(blob);
            const link = document.createElement('a');
            link.href = url;
            link.download = `receipt-${invoice.invoiceNumber}.pdf`;
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
            window.URL.revokeObjectURL(url);

            toast.success('Receipt downloaded successfully!');
        } catch (error) {
            console.error('Error downloading receipt:', error);
            toast.error('Failed to download receipt');
        }
    };

    if (loading) {
        return (
            <div className="flex items-center justify-center min-h-screen">
                <div className="animate-spin rounded-full h-32 w-32 border-b-2 border-blue-500"></div>
            </div>
        );
    }

    if (!invoice) {
        return (
            <div className="min-h-screen bg-gray-50 p-6">
                <div className="text-center">
                    <h2 className="text-2xl font-bold text-gray-900">Invoice not found</h2>
                    <button
                        onClick={() => navigate('/owner/invoices')}
                        className="mt-4 px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700"
                    >
                        Back to Invoices
                    </button>
                </div>
            </div>
        );
    }

    return (
        <div className="min-h-screen bg-gray-50 p-6">
            {/* Header */}
            <div className="mb-8">
                <div className="flex items-center justify-between">
                    <div>
                        <h1 className="text-3xl font-bold text-gray-900">Invoice {invoice.invoiceNumber}</h1>
                        <p className="text-gray-600">{invoice.lab?.name}</p>
                    </div>
                    <div className="flex gap-4">
                        <button
                            onClick={() => navigate('/owner/invoices')}
                            className="px-4 py-2 text-gray-600 border border-gray-300 rounded hover:bg-gray-50"
                        >
                            ← Back to Invoices
                        </button>
                        <button
                            onClick={downloadReceipt}
                            className="px-6 py-2 bg-green-600 text-white rounded hover:bg-green-700"
                        >
                            📄 Download Receipt
                        </button>
                    </div>
                </div>
            </div>

            {/* Invoice Details */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-6">
                <div className="bg-white rounded-lg shadow p-6">
                    <h3 className="text-lg font-semibold mb-4">Invoice Information</h3>
                    <div className="space-y-2 text-sm">
                        <div><span className="font-medium">Invoice #:</span> {invoice.invoiceNumber}</div>
                        <div><span className="font-medium">Generated:</span> {new Date(invoice.generatedAt).toLocaleDateString()}</div>
                        <div><span className="font-medium">Due Date:</span> {new Date(invoice.payment.dueDate).toLocaleDateString()}</div>
                        <div><span className="font-medium">Status:</span> 
                            <span className={`ml-2 px-2 py-1 text-xs rounded-full ${
                                invoice.status === 'paid' ? 'bg-green-100 text-green-800' :
                                invoice.status === 'overdue' ? 'bg-red-100 text-red-800' :
                                'bg-yellow-100 text-yellow-800'
                            }`}>
                                {invoice.status.charAt(0).toUpperCase() + invoice.status.slice(1)}
                            </span>
                        </div>
                    </div>
                </div>

                <div className="bg-white rounded-lg shadow p-6">
                    <h3 className="text-lg font-semibold mb-4">Lab Information</h3>
                    <div className="space-y-2 text-sm">
                        <div><span className="font-medium">Name:</span> {invoice.lab?.name}</div>
                        <div><span className="font-medium">Identifier:</span> {invoice.lab?.identifier}</div>
                        <div><span className="font-medium">Contact:</span> {invoice.lab?.contactPerson}</div>
                        <div><span className="font-medium">Email:</span> {invoice.lab?.contactEmail}</div>
                    </div>
                </div>

                <div className="bg-white rounded-lg shadow p-6">
                    <h3 className="text-lg font-semibold mb-4">Billing Summary</h3>
                    <div className="space-y-2 text-sm">
                        <div className="flex justify-between">
                            <span>Studies:</span>
                            <span>{invoice.breakdown.totalStudies}</span>
                        </div>
                        <div className="flex justify-between">
                            <span>Subtotal:</span>
                            <span>₹{invoice.breakdown.subtotal.toFixed(2)}</span>
                        </div>
                        <div className="flex justify-between">
                            <span>Tax ({invoice.breakdown.taxRate}%):</span>
                            <span>₹{invoice.breakdown.taxAmount.toFixed(2)}</span>
                        </div>
                        <div className="border-t pt-2 font-semibold flex justify-between">
                            <span>Total:</span>
                            <span>₹{invoice.breakdown.totalAmount.toFixed(2)}</span>
                        </div>
                    </div>
                </div>
            </div>

            {/* Billing Period */}
            <div className="bg-white rounded-lg shadow p-6 mb-6">
                <h3 className="text-lg font-semibold mb-4">Billing Period</h3>
                <div className="flex items-center gap-4 text-sm">
                    <div>
                        <span className="font-medium">From:</span> {new Date(invoice.billingPeriod.startDate).toLocaleDateString()}
                    </div>
                    <div>
                        <span className="font-medium">To:</span> {new Date(invoice.billingPeriod.endDate).toLocaleDateString()}
                    </div>
                </div>
            </div>

            {/* Modality Breakdown */}
            <div className="bg-white rounded-lg shadow overflow-hidden mb-6">
                <div className="px-6 py-4 bg-gray-50 border-b">
                    <h3 className="text-lg font-semibold">Modality Breakdown</h3>
                </div>
                <div className="overflow-x-auto">
                    <table className="min-w-full divide-y divide-gray-200">
                        <thead className="bg-gray-50">
                            <tr>
                                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                                    Modality
                                </th>
                                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                                    Study Count
                                </th>
                                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                                    Price Per Study
                                </th>
                                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                                    Subtotal
                                </th>
                            </tr>
                        </thead>
                        <tbody className="bg-white divide-y divide-gray-200">
                            {invoice.breakdown.modalityBreakdown.map((modality, index) => (
                                <tr key={index}>
                                    <td className="px-6 py-4 whitespace-nowrap">
                                        <span className="px-2 py-1 text-xs font-semibold rounded-full bg-blue-100 text-blue-800">
                                            {modality.modality}
                                        </span>
                                    </td>
                                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                                        {modality.studyCount}
                                    </td>
                                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                                        ₹{modality.pricePerStudy}
                                    </td>
                                    <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                                        ₹{modality.subtotal.toFixed(2)}
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            </div>

            {/* Studies Billed */}
            <div className="bg-white rounded-lg shadow overflow-hidden">
                <div className="px-6 py-4 bg-gray-50 border-b">
                    <h3 className="text-lg font-semibold">Studies Billed</h3>
                </div>
                <div className="overflow-x-auto">
                    <table className="min-w-full divide-y divide-gray-200">
                        <thead className="bg-gray-50">
                            <tr>
                                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                                    Patient Name
                                </th>
                                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                                    Study Date
                                </th>
                                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                                    Modality
                                </th>
                                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                                    Price
                                </th>
                            </tr>
                        </thead>
                        <tbody className="bg-white divide-y divide-gray-200">
                            {invoice.studiesBilled.map((study, index) => (
                                <tr key={index} className="hover:bg-gray-50">
                                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                                        {study.patientName}
                                    </td>
                                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                                        {new Date(study.studyDate).toLocaleDateString()}
                                    </td>
                                    <td className="px-6 py-4 whitespace-nowrap">
                                        <span className="px-2 py-1 text-xs font-semibold rounded-full bg-blue-100 text-blue-800">
                                            {study.modality}
                                        </span>
                                    </td>
                                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                                        ₹{study.finalPrice}
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            </div>
        </div>
    );
};

export default InvoiceDetail;