import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { toast } from 'react-hot-toast';
import api from '../services/api';

const LabBillingDetails = () => {
    const { labId } = useParams();
    const navigate = useNavigate();
    
    const [labDetails, setLabDetails] = useState(null);
    const [loading, setLoading] = useState(true);
    const [startDate, setStartDate] = useState(
        new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString().split('T')[0]
    );
    const [endDate, setEndDate] = useState(
        new Date().toISOString().split('T')[0]
    );
    const [generating, setGenerating] = useState(false);

    useEffect(() => {
        fetchLabDetails();
    }, [labId, startDate, endDate]);

    const fetchLabDetails = async () => {
        try {
            setLoading(true);
            const response = await api.get(`/owner/labs/${labId}/details`, {
                params: { startDate, endDate }
            });

            if (response.data.success) {
                setLabDetails(response.data.data);
            }
        } catch (error) {
            console.error('Error fetching lab details:', error);
            toast.error('Failed to fetch lab details');
        } finally {
            setLoading(false);
        }
    };

    const generateInvoice = async () => {
        try {
            setGenerating(true);
            const response = await api.post(`/owner/labs/${labId}/invoice`, {
                startDate,
                endDate,
                notes: `Invoice for ${labDetails?.lab?.name} - ${startDate} to ${endDate}`
            });

            if (response.data.success) {
                toast.success('Invoice generated successfully!');
                navigate(`/owner/invoices/${response.data.data._id}`);
            }
        } catch (error) {
            console.error('Error generating invoice:', error);
            toast.error(error.response?.data?.message || 'Failed to generate invoice');
        } finally {
            setGenerating(false);
        }
    };

    if (loading) {
        return (
            <div className="flex items-center justify-center min-h-screen">
                <div className="animate-spin rounded-full h-32 w-32 border-b-2 border-blue-500"></div>
            </div>
        );
    }

    if (!labDetails) {
        return (
            <div className="min-h-screen bg-gray-50 p-6">
                <div className="text-center">
                    <h2 className="text-2xl font-bold text-gray-900">Lab not found</h2>
                    <button
                        onClick={() => navigate('/owner/dashboard')}
                        className="mt-4 px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700"
                    >
                        Back to Dashboard
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
                        <h1 className="text-3xl font-bold text-gray-900">{labDetails.lab.name}</h1>
                        <p className="text-gray-600">Billing Details - {labDetails.billingPeriod.description}</p>
                    </div>
                    <button
                        onClick={() => navigate('/owner/dashboard')}
                        className="px-4 py-2 text-gray-600 border border-gray-300 rounded hover:bg-gray-50"
                    >
                        ← Back to Dashboard
                    </button>
                </div>
            </div>

            {/* Period Selection */}
            <div className="bg-white rounded-lg shadow p-6 mb-6">
                <h2 className="text-lg font-semibold mb-4">Billing Period</h2>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4 items-end">
                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-2">
                            Start Date
                        </label>
                        <input
                            type="date"
                            value={startDate}
                            onChange={(e) => setStartDate(e.target.value)}
                            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                        />
                    </div>
                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-2">
                            End Date
                        </label>
                        <input
                            type="date"
                            value={endDate}
                            onChange={(e) => setEndDate(e.target.value)}
                            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                        />
                    </div>
                    <div>
                        <button
                            onClick={fetchLabDetails}
                            className="w-full px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
                        >
                            Update Period
                        </button>
                    </div>
                </div>
            </div>

            {/* Lab Information */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-6">
                <div className="bg-white rounded-lg shadow p-6">
                    <h3 className="text-lg font-semibold mb-4">Lab Information</h3>
                    <div className="space-y-2 text-sm">
                        <div><span className="font-medium">Name:</span> {labDetails.lab.name}</div>
                        <div><span className="font-medium">Identifier:</span> {labDetails.lab.identifier}</div>
                        <div><span className="font-medium">Contact:</span> {labDetails.lab.contactPerson}</div>
                        <div><span className="font-medium">Email:</span> {labDetails.lab.contactEmail}</div>
                        <div><span className="font-medium">Phone:</span> {labDetails.lab.contactPhone}</div>
                    </div>
                </div>

                <div className="bg-white rounded-lg shadow p-6">
                    <h3 className="text-lg font-semibold mb-4">Study Summary</h3>
                    <div className="text-center">
                        <div className="text-3xl font-bold text-blue-600 mb-2">
                            {labDetails.studies.totalStudies}
                        </div>
                        <div className="text-sm text-gray-600">Total Studies</div>
                        <div className="mt-4 text-sm text-gray-500">
                            Period: {new Date(startDate).toLocaleDateString()} - {new Date(endDate).toLocaleDateString()}
                        </div>
                    </div>
                </div>

                <div className="bg-white rounded-lg shadow p-6">
                    <h3 className="text-lg font-semibold mb-4">Billing Summary</h3>
                    <div className="space-y-2 text-sm">
                        <div className="flex justify-between">
                            <span>Subtotal:</span>
                            <span>₹{labDetails.billing.subtotal.toFixed(2)}</span>
                        </div>
                        <div className="flex justify-between">
                            <span>Tax ({labDetails.billing.taxRate}%):</span>
                            <span>₹{labDetails.billing.taxAmount.toFixed(2)}</span>
                        </div>
                        <div className="border-t pt-2 font-semibold flex justify-between">
                            <span>Total:</span>
                            <span>₹{labDetails.billing.totalAmount.toFixed(2)}</span>
                        </div>
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
                            {labDetails.studies.modalityBreakdown.map((modality, index) => (
                                <tr key={index} className="hover:bg-gray-50">
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

            {/* Generate Invoice */}
            {labDetails.studies.totalStudies > 0 && (
                <div className="bg-white rounded-lg shadow p-6">
                    <div className="flex items-center justify-between">
                        <div>
                            <h3 className="text-lg font-semibold">Generate Invoice</h3>
                            <p className="text-sm text-gray-600 mt-1">
                                Create a formal invoice for the selected period
                            </p>
                        </div>
                        <button
                            onClick={generateInvoice}
                            disabled={generating}
                            className="px-6 py-3 bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
                        >
                            {generating ? (
                                <>
                                    <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
                                    Generating...
                                </>
                            ) : (
                                <>
                                    📄 Generate Invoice
                                </>
                            )}
                        </button>
                    </div>
                </div>
            )}

            {labDetails.studies.totalStudies === 0 && (
                <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-6 text-center">
                    <div className="text-yellow-800">
                        <h3 className="text-lg font-medium">No Studies Found</h3>
                        <p className="mt-1">No studies were found for the selected period.</p>
                        <p className="text-sm mt-2">Try adjusting the date range to include studies.</p>
                    </div>
                </div>
            )}
        </div>
    );
};

export default LabBillingDetails;