import axios from 'axios'

// Client API Configuration
const CLIENT_API_BASE_URL = import.meta.env.VITE_CLIENT_API_BASE_URL;
const MACHINE_API_BASE_URL = import.meta.env.VITE_MACHINE_API_BASE_URL;
const CLIENT_API_TOKEN = import.meta.env.VITE_CLIENT_API_TOKEN;
const MACHINE_API_KEY = import.meta.env.VITE_MACHINE_API_KEY;

/**
 * Fetch all customers from client API
 */
export async function fetchCustomers() {
  try {
    const response = await axios.get(`${CLIENT_API_BASE_URL}/api/user`, {
      headers: {
        'Authorization': `Bearer ${CLIENT_API_TOKEN}`,
        'Content-Type': 'application/json'
      }
    })
    return response.data
  } catch (error) {
    console.error('Error fetching customers:', error)
    throw error
  }
}

/**
 * Fetch departments for a specific customer
 */
export async function fetchDepartments(custId) {
  try {
    const response = await axios.get(`${CLIENT_API_BASE_URL}/department`, {
      params: { custId },
      headers: {
        'Authorization': `Bearer ${CLIENT_API_TOKEN}`,
        'Content-Type': 'application/json'
      }
    })
    return response.data
  } catch (error) {
    console.error(`Error fetching departments for customer ${custId}:`, error)
    throw error
  }
}

/**
 * Fetch machine details with status and metrics
 */
export async function fetchMachineDetails(custId, deviceId) {
  try {
    const response = await axios.post(`${MACHINE_API_BASE_URL}/machineCard`, {
      custID: custId,
      deviceID: deviceId
    }, {
      headers: {
        'x-functions-key': MACHINE_API_KEY,
        'Content-Type': 'application/json'
      }
    })
    return response.data
  } catch (error) {
    console.error(`Error fetching machine details for device ${deviceId}:`, error)
    throw error
  }
}

/**
 * Map machine status code to status string
 */
function mapMachineStatus(statusCode) {
  const statusMap = {
    0: 'IDLE',
    1: 'RUNNING',
    2: 'DOWN', // in K2 BREAKDOWN
    3: 'MAINTENANCE', // in K2 INTERLOCK
    4: 'OFFLINE', 
  }
  return statusMap[statusCode] || 'UNKNOWN'
}

/**
 * Transform customer data to match project hierarchy
 * Hierarchy: Customer -> Department -> Machines (with default zone)
 */
export async function transformCustomerData(customers, fetchMachineMetrics = false) {
  if (!Array.isArray(customers)) return []

  const transformedCustomers = await Promise.all(customers.map(async (customer) => {
    const custId = customer.status?.custId || customer.id
    const departments = customer.status?.departmentShiftDetails || []
    const devices = customer.status?.deviceDetails || []

    // Group devices by department name
    const devicesByDept = devices.reduce((acc, device) => {
      const deptName = device.departmentName || 'Unknown Department'
      if (!acc[deptName]) acc[deptName] = []
      acc[deptName].push(device)
      return acc
    }, {})

    // Transform departments
    const transformedDepartments = await Promise.all(departments.map(async (dept) => {
      const deptDevices = devicesByDept[dept.departmentName] || []
      
      // Optionally fetch real-time machine metrics
      const machinesWithMetrics = await Promise.all(deptDevices.map(async (device) => {
        // Initialize with default structure that UI expects
        let machineData = {
          id: device.deviceId,
          name: device.deviceName,
          status: 'UNKNOWN',
          efficiency: 0,
          deviceId: device.deviceId,
          deviceName: device.deviceName,
          departmentName: device.departmentName,
          updatedAt: new Date().toISOString(),
          
          // Default time metrics
          timeMetrics: {
            plannedProductionTime: 0,
            runTime: 0,
            idleTime: 0,
            breakdownTime: 0,
            downTime: 0,
            offTime: 0,
          },
          
          // Default production metrics
          productionMetrics: {
            totalPartsProduced: 0,
            goodParts: 0,
            rejectedParts: 0,
            idealCycleTime: 0,
          },
          
          // Default OEE metrics
          oeeMetrics: {
            availability: 0,
            performance: 0,
            quality: 0,
            oee: 0,
          }
        }

        // Fetch real-time metrics if requested
        if (fetchMachineMetrics) {
          try {
            console.log(`🔍 Fetching metrics for device ${device.deviceId} (custId: ${custId})...`)
            const metrics = await fetchMachineDetails(custId, device.deviceId)
            console.log(`✅ Metrics fetched for ${device.deviceName}:`, {
              status: metrics.status,
              oee: metrics.oee,
              availability: metrics.availability,
              performance: metrics.performance,
              quality: metrics.quality
            })
            
            // Convert hours to seconds for time metrics
            const totalRunningSeconds = (metrics.total_running || 0) * 3600
            const totalIdleSeconds = (metrics.total_idle || 0) * 3600
            const totalOffSeconds = (metrics.total_off || 0) * 3600
            const totalPlannedSeconds = totalRunningSeconds + totalIdleSeconds
            
            // Calculate parts from quality percentage
            const totalParts = metrics.Ai_partcount || 0
            const qualityPct = metrics.quality || 100
            const goodParts = Math.round(totalParts * (qualityPct / 100))
            
            // Update machine data with API metrics
            machineData = {
              ...machineData,
              status: mapMachineStatus(metrics.status),
              efficiency: metrics.oee || 0,
              deviceType: metrics.deviceType,
              partcountType: metrics.partcountType,
              operatorName: metrics.operatorName || '',
              partName: metrics.partName || '',
              lastUpdatedTime: metrics.LUT,
              updatedAt: new Date().toISOString(),
              
              // Time metrics structure expected by UI
              timeMetrics: {
                plannedProductionTime: totalPlannedSeconds,
                runTime: totalRunningSeconds,
                idleTime: totalIdleSeconds,
                breakdownTime: totalOffSeconds, // API's total_off represents breakdown/offline time
                downTime: totalOffSeconds, // Alias for breakdownTime
                offTime: 0, // Not provided separately by API
              },
              
              // Production metrics structure expected by UI
              productionMetrics: {
                totalPartsProduced: totalParts,
                goodParts: goodParts,
                rejectedParts: totalParts - goodParts,
                idealCycleTime: 0, // Not provided by API
              },
              
              // Energy metrics
              energyMetrics: {
                totalEnergy: metrics.total_energy,
                totalCurrent: metrics.total_current,
                realPower: metrics.real_power,
                apparentPower: metrics.apparent_power,
                powerUnitCost: metrics.powerUnitCost,
              },
              
              // Direct OEE values from API (already calculated as percentages)
              oeeMetrics: {
                availability: metrics.availability || 0,
                performance: metrics.performance || 0,
                quality: metrics.quality || 0,
                oee: metrics.oee || 0,
              }
            }
          } catch (error) {
            console.error(`Failed to fetch metrics for device ${device.deviceId}:`, error.message)
            console.error('Error details:', error.response?.data || error)
            // Keep default structure with zero values
          }
        }

        return machineData
      }))
      
      // Create default zone with all machines for this department
      const defaultZone = {
        id: `${custId}-${dept.departmentName}-default-zone`,
        name: 'Main Zone',
        machines: machinesWithMetrics
      }

      return {
        id: `${custId}-${dept.departmentName}`,
        name: dept.departmentName,
        custId: dept.custId,
        zones: [defaultZone],
        shiftData: dept.shiftData || []
      }
    }))

    return {
      id: custId,
      name: customer.name,
      email: customer.email,
      plant: customer.plant,
      noOfMachines: customer.noOfMachines,
      timeZone: customer.timeZone,
      departments: transformedDepartments,
      status: customer.status,
      updatedAt: new Date().toISOString()
    }
  }))

  return transformedCustomers
}

/**
 * Fetch and transform customer hierarchy data
 * @param {boolean} fetchMachineMetrics - Whether to fetch real-time machine metrics
 */
export async function fetchCustomerHierarchy(fetchMachineMetrics = true) {
  const customers = await fetchCustomers()
  return await transformCustomerData(customers, fetchMachineMetrics)
}

/**
 * Get specific customer by ID
 */
export async function getCustomerById(customerId) {
  const customers = await fetchCustomerHierarchy()
  return customers.find(c => c.id === customerId)
}

/**
 * Get department by customer ID and department ID
 */
export async function getDepartmentById(customerId, departmentId) {
  const customer = await getCustomerById(customerId)
  if (!customer) return null
  return customer.departments.find(d => d.id === departmentId)
}

/**
 * Get all machines for a department
 */
export async function getDepartmentMachines(customerId, departmentId) {
  const department = await getDepartmentById(customerId, departmentId)
  if (!department) return []
  
  // Get machines from all zones
  return department.zones.flatMap(zone => zone.machines || [])
}

/**
 * Get real-time machine details by customer ID and device ID
 */
export async function getMachineById(customerId, deviceId) {
  try {
    const metrics = await fetchMachineDetails(customerId, deviceId)
    
    return {
      id: metrics.device_id || deviceId,
      name: metrics.deviceName,
      status: mapMachineStatus(metrics.status),
      oee: metrics.oee || 0,
      availability: metrics.availability || 0,
      performance: metrics.performance || 0,
      quality: metrics.quality || 0,
      efficiency: metrics.oee || 0,
      deviceId: metrics.device_id,
      deviceName: metrics.deviceName,
      deviceType: metrics.deviceType,
      departmentName: metrics.departmentName,
      partcountType: metrics.partcountType,
      partCount: metrics.Ai_partcount,
      totalEnergy: metrics.total_energy,
      totalCurrent: metrics.total_current,
      realPower: metrics.real_power,
      apparentPower: metrics.apparent_power,
      totalRunning: metrics.total_running,
      totalIdle: metrics.total_idle,
      totalOff: metrics.total_off,
      operatorName: metrics.operatorName,
      partName: metrics.partName,
      shiftList: metrics.Shift_List,
      lastUpdatedTime: metrics.LUT,
      updatedAt: new Date().toISOString()
    }
  } catch (error) {
    console.error(`Error fetching machine ${deviceId}:`, error)
    throw error
  }
}
/**
 * Fetch live machine card data for all machines in a department
 * @param {string} custId - Customer ID
 * @param {Array} machines - Array of machine objects with deviceId
 * @returns {Promise<Array>} Array of machine data with live status and metrics
 */
export async function fetchDepartmentMachinesLiveData(custId, machines) {
  if (!machines || !Array.isArray(machines) || machines.length === 0) {
    return []
  }

  try {
    console.log(`🔄 Fetching live data for ${machines.length} machines in department (custId: ${custId})`)
    
    // Fetch machine card data for all machines in parallel
    const machinePromises = machines.map(async (machine) => {
      try {
        const deviceId = machine.deviceId || machine.id
        const response = await axios.post(`${MACHINE_API_BASE_URL}/machineCard`, {
          custID: custId,
          deviceID: deviceId
        }, {
          headers: {
            'x-functions-key': MACHINE_API_KEY,
            'Content-Type': 'application/json'
          }
        })
        
        const metrics = response.data
        
        // Return updated machine object with live data
        return {
          ...machine,
          id: machine.id,
          deviceId: deviceId,
          status: mapMachineStatus(metrics.status),
          efficiency: metrics.oee || 0,
          oee: metrics.oee || 0,
          availability: metrics.availability || 0,
          performance: metrics.performance || 0,
          quality: metrics.quality || 0,
          partCount: metrics.Ai_partcount || 0,
          totalEnergy: metrics.total_energy || 0,
          powerUnitCost: metrics.powerUnitCost || 0,
          updatedAt: new Date().toISOString(),
          // Keep original properties
          name: machine.name || metrics.deviceName,
          deviceName: machine.deviceName || metrics.deviceName,
        }
      } catch (error) {
        console.error(`❌ Error fetching data for machine ${machine.id}:`, error)
        // Return original machine data if API call fails
        return machine
      }
    })
    
    const results = await Promise.all(machinePromises)
    console.log(`✅ Successfully fetched live data for ${results.length} machines`)
    return results
  } catch (error) {
    console.error('❌ Error fetching department machines live data:', error)
    // Return original machines if batch fetch fails
    return machines
  }
}

/**
 * Fetch hourly OEE data for a department
 * @param {string} custId - Customer ID
 * @param {string} date - Date in YYYY-MM-DD format
 * @param {string} department - Department name
 * @param {string} shiftName - Shift name
 * @returns {Promise<Object>} Hourly OEE data with today/yesterday metrics and summary
 */
export async function fetchDepartmentHourlyOEE(custId, date, department, shiftName) {
  try {
    const response = await axios.get(`${CLIENT_API_BASE_URL}/department/depthourlyoee`, {
      params: { custId, date, department, shiftName },
      headers: {
        'Authorization': `Bearer ${CLIENT_API_TOKEN}`,
        'Content-Type': 'application/json'
      }
    })
    return response.data
  } catch (error) {
    console.error(`Error fetching hourly OEE for department ${department}:`, error)
    throw error
  }
}