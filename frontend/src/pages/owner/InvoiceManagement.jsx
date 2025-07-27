import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'react-hot-toast';
import api from '../../services/api';

const InvoiceManagement = () => {
    const [invoices, setInvoices] = useState([]);
    const [loading, setLoading] = useState(true);
    const [pagination, setPagination] = useState({});
    const [filters, setFilters] = useState({
        status: '',
        labId: ''
    });
    const [labs, setLabs] = useState([]);
    
    const navigate = useNavigate();

    useEffect(() => {
        fetchInvoices();
        fetchLabs();
    }, [filters]);

    const fetchInvoices = async (page = 1) => {
        try {
            setLoading(true);
            const response = await api.get('/owner/invoices', {
                params: { page, ...filters, limit: 20 }
            });

            if (response.data.success) {
                setInvoices(response.data.data.invoices);
                setPagination(response.data.data.pagination);
            }
        } catch (error) {
            console.error('Error fetching invoices:', error);
            toast.error('Failed to fetch invoices');
        } finally {
            setLoading(false);
        }
    };

    const fetchLabs = async () => {
        try {
            const response = await api.get('/owner/dashboard', {
                params: { limit: 100 }
            });
            if (response.data.success) {
                setLabs(response.data.data.labs);
            }
        } catch (error) {
            console.error('Error fetching labs:', error);
        }
    };

    const downloadReceipt = async (invoiceId, invoiceNumber) => {
        try {
            const response = await api.get(`/owner/invoices/${invoiceId}/receipt`, {
                responseType: 'blob'
            });

            const blob = new Blob([response.data], { type: 'application/pdf' });
            const url = window.URL.createObjectURL(blob);
            const link = document.createElement('a');
            link.href = url;
            link.download = `receipt-${invoiceNumber}.pdf`;
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

    const getStatusColor = (status) => {
        const colors = {
            draft: 'bg-gray-100 text-gray-800',
            generated: 'bg-blue-100 text-blue-800',
            sent: 'bg-yellow-100 text-yellow-800',
            paid: 'bg-green-100 text-green-800',
            overdue: 'bg-red-100 text-red-800',
            cancelled: 'bg-gray-100 text-gray-800'
        };
        return colors[status] || 'bg-gray-100 text-gray-800';
    };

    if (loading) {
        return (
            <div className="flex items-center justify-center min-h-screen">
                <div className="animate-spin rounded-full h-32 w-32 border-b-2 border-blue-500"></div>
            </div>
        );
    }

    return (
        <div className="min-h-screen bg-gray-50 p-6">
            {/* Header */}
            <div className="mb-8">
                <div className="flex items-center justify-between">
                    <div>
                        <h1 className="text-3xl font-bold text-gray-900">Invoice Management</h1>
                        <p className="text-gray-600">Manage and track all billing invoices</p>
                    </div>
                    <button
                        onClick={() => navigate('/owner/dashboard')}
                        className="px-4 py-2 text-gray-600 border border-gray-300 rounded hover:bg-gray-50"
                    >
                        ← Back to Dashboard
                    </button>
                </div>
            </div>

            {/* Filters */}
            <div className="bg-white rounded-lg shadow p-6 mb-6">
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-2">
                            Filter by Status
                        </label>
                        <select
                            value={filters.status}
                            onChange={(e) => setFilters({ ...filters, status: e.target.value })}
                            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                        >
                            <option value="">All Statuses</option>
                            <option value="draft">Draft</option>
                            <option value="generated">Generated</option>
                            <option value="sent">Sent</option>
                            <option value="paid">Paid</option>
                            <option value="overdue">Overdue</option>
                            <option value="cancelled">Cancelled</option>
                        </select>
                    </div>
                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-2">
                            Filter by Lab
                        </label>
                        <select
                            value={filters.labId}
                            onChange={(e) => setFilters({ ...filters, labId: e.target.value })}
                            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                        >
                            <option value="">All Labs</option>
                            {labs.map((lab) => (
                                <option key={lab._id} value={lab._id}>
                                    {lab.name}
                                </option>
                            ))}
                        </select>
                    </div>
                    <div className="flex items-end">
                        <button
                            onClick={() => setFilters({ status: '', labId: '' })}
                            className="w-full px-4 py-2 bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300"
                        >
                            Clear Filters
                        </button>
                    </div>
                </div>
            </div>

            {/* Invoices Table */}
            <div className="bg-white rounded-lg shadow overflow-hidden">
                <table className="min-w-full divide-y divide-gray-200">
                    <thead className="bg-gray-50">
                        <tr>
                            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                                Invoice #
                            </th>
                            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                                Lab
                            </th>
                            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                                Period
                            </th>
                            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                                Amount
                            </th>
                            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                                Status
                            </th>
                            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                                Due Date
                            </th>
                            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                                Actions
                            </th>
                        </tr>
                    </thead>
                    <tbody className="bg-white divide-y divide-gray-200">
                        {invoices.map((invoice) => (
                            <tr key={invoice._id} className="hover:bg-gray-50">
                                <td className="px-6 py-4 whitespace-nowrap">
                                    <div className="text-sm font-medium text-gray-900">
                                        {invoice.invoiceNumber}
                                    </div>
                                    <div className="text-sm text-gray-500">
                                        Generated: {new Date(invoice.generatedAt).toLocaleDateString()}
                                    </div>
                                </td>
                                <td className="px-6 py-4 whitespace-nowrap">
                                    <div className="text-sm font-medium text-gray-900">
                                        {invoice.lab?.name}
                                    </div>
                                    <div className="text-sm text-gray-500">
                                        {invoice.lab?.identifier}
                                    </div>
                                </td>
                                <td className="px-6 py-4 whitespace-nowrap">
                                    <div className="text-sm text-gray-900">
                                        {new Date(invoice.billingPeriod.startDate).toLocaleDateString()} -
                                    </div>
                                    <div className="text-sm text-gray-900">
                                        {new Date(invoice.billingPeriod.endDate).toLocaleDateString()}
                                    </div>
                                </td>
                                <td className="px-6 py-4 whitespace-nowrap">
                                    <div className="text-sm font-medium text-gray-900">
                                        ₹{invoice.breakdown.totalAmount.toFixed(2)}
                                    </div>
                                    <div className="text-sm text-gray-500">
                                        {invoice.breakdown.totalStudies} studies
                                    </div>
                                </td>
                                <td className="px-6 py-4 whitespace-nowrap">
                                    <span className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full ${getStatusColor(invoice.status)}`}>
                                        {invoice.status.charAt(0).toUpperCase() + invoice.status.slice(1)}
                                    </span>
                                </td>
                                <td className="px-6 py-4 whitespace-nowrap">
                                    <div className="text-sm text-gray-900">
                                        {new Date(invoice.payment.dueDate).toLocaleDateString()}
                                    </div>
                                    {new Date(invoice.payment.dueDate) < new Date() && invoice.status !== 'paid' && (
                                        <div className="text-xs text-red-600 font-medium">Overdue</div>
                                    )}
                                </td>
                                <td className="px-6 py-4 whitespace-nowrap text-sm font-medium">
                                    <div className="flex gap-2">
                                        <button
                                            onClick={() => navigate(`/owner/invoices/${invoice._id}`)}
                                            className="text-blue-600 hover:text-blue-900"
                                        >
                                            View
                                        </button>
                                        <button
                                            onClick={() => downloadReceipt(invoice._id, invoice.invoiceNumber)}
                                            className="text-green-600 hover:text-green-900"
                                        >
                                            Download
                                        </button>
                                    </div>
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>

                {invoices.length === 0 && (
                    <div className="text-center py-12">
                        <div className="text-gray-500">
                            <h3 className="text-lg font-medium">No invoices found</h3>
                            <p className="mt-1">No invoices match your current filters.</p>
                        </div>
                    </div>
                )}
            </div>

            {/* Pagination */}
            {pagination.totalPages > 1 && (
                <div className="mt-6 flex justify-center">
                    <div className="flex gap-2">
                        {Array.from({ length: pagination.totalPages }, (_, i) => i + 1).map((page) => (
                            <button
                                key={page}
                                onClick={() => fetchInvoices(page)}
                                className={`px-3 py-2 rounded ${
                                    pagination.currentPage === page
                                        ? 'bg-blue-600 text-white'
                                        : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
                                }`}
                            >
                                {page}
                            </button>
                        ))}
                    </div>
                </div>
            )}
        </div>
    );
};

export default InvoiceManagement;