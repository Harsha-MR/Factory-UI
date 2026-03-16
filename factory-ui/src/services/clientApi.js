import axios from 'axios'

const CLIENT_API_BASE_URL = import.meta.env.VITE_CLIENT_API_BASE_URL
const MACHINE_API_BASE_URL = import.meta.env.VITE_MACHINE_API_BASE_URL
const CLIENT_API_TOKEN = import.meta.env.VITE_CLIENT_API_TOKEN
const MACHINE_API_KEY = import.meta.env.VITE_MACHINE_API_KEY

function normalizeApiPayload(payload) {
  if (typeof payload !== 'string') return payload
  const text = payload.trim()
  if (!text) return payload

  try {
    return JSON.parse(text)
  } catch {
    return payload
  }
}

export async function fetchCustomers() {
  const response = await axios.get(`${CLIENT_API_BASE_URL}/api/user`, {
    headers: {
      Authorization: `Bearer ${CLIENT_API_TOKEN}`,
      'Content-Type': 'application/json',
    },
  })
  return normalizeApiPayload(response.data)
}

export async function fetchMachineDetails(custId, deviceId) {
  const response = await axios.post(
    `${MACHINE_API_BASE_URL}/machineCard`,
    {
      custID: custId,
      deviceID: deviceId,
    },
    {
      headers: {
        'x-functions-key': MACHINE_API_KEY,
        'Content-Type': 'application/json',
      },
    },
  )

  return normalizeApiPayload(response.data)
}

function mapMachineStatus(statusCode) {
  const statusMap = {
    0: 'IDLE',
    1: 'RUNNING',
    2: 'DOWN',
    3: 'MAINTENANCE',
    4: 'OFFLINE',
  }
  return statusMap[statusCode] || 'UNKNOWN'
}

export function buildMachineRecord(device = {}, metrics = null, custId = '') {
  const deviceId = device.deviceId || device.id || ''
  const deviceName = device.deviceName || device.name || deviceId || 'Unknown Machine'
  const departmentName = device.departmentName || device.department || ''
  const updatedAt = new Date().toISOString()

  const baseRecord = {
    id: deviceId,
    name: deviceName,
    status: 'UNKNOWN',
    efficiency: 0,
    deviceId,
    deviceName,
    departmentName,
    custId,
    updatedAt,
    timeMetrics: {
      plannedProductionTime: 0,
      runTime: 0,
      idleTime: 0,
      breakdownTime: 0,
      downTime: 0,
      offTime: 0,
    },
    productionMetrics: {
      totalPartsProduced: 0,
      goodParts: 0,
      rejectedParts: 0,
      idealCycleTime: 0,
    },
    oeeMetrics: {
      availability: 0,
      performance: 0,
      quality: 0,
      oee: 0,
    },
  }

  if (!metrics || typeof metrics !== 'object') return baseRecord

  const totalRunningSeconds = Number(metrics.total_running || 0) * 3600
  const totalIdleSeconds = Number(metrics.total_idle || 0) * 3600
  const totalOffSeconds = Number(metrics.total_off || 0) * 3600
  const totalPlannedSeconds = totalRunningSeconds + totalIdleSeconds
  const totalParts = Number(metrics.Ai_partcount || 0)
  const qualityPct = Number(metrics.quality || 100)
  const goodParts = Math.round(totalParts * (qualityPct / 100))

  return {
    ...baseRecord,
    status: mapMachineStatus(metrics.status),
    efficiency: metrics.oee || 0,
    deviceType: metrics.deviceType,
    partcountType: metrics.partcountType,
    operatorName: metrics.operatorName || '',
    partName: metrics.partName || '',
    lastUpdatedTime: metrics.LUT,
    updatedAt,
    timeMetrics: {
      plannedProductionTime: totalPlannedSeconds,
      runTime: totalRunningSeconds,
      idleTime: totalIdleSeconds,
      breakdownTime: totalOffSeconds,
      downTime: totalOffSeconds,
      offTime: 0,
    },
    productionMetrics: {
      totalPartsProduced: totalParts,
      goodParts,
      rejectedParts: totalParts - goodParts,
      idealCycleTime: 0,
    },
    energyMetrics: {
      totalEnergy: metrics.total_energy,
      totalCurrent: metrics.total_current,
      realPower: metrics.real_power,
      apparentPower: metrics.apparent_power,
      powerUnitCost: metrics.powerUnitCost,
    },
    oeeMetrics: {
      availability: metrics.availability || 0,
      performance: metrics.performance || 0,
      quality: metrics.quality || 0,
      oee: metrics.oee || 0,
    },
    Shift_List: metrics.Shift_List || [],
  }
}

export async function transformCustomerData(customers, fetchMachineMetrics = false) {
  if (!Array.isArray(customers)) return []

  return Promise.all(
    customers.map(async (customer) => {
      const custId = customer.status?.custId || customer.id
      const departments = customer.status?.departmentShiftDetails || []
      const devices = customer.status?.deviceDetails || []

      const devicesByDept = devices.reduce((acc, device) => {
        const deptName = device.departmentName || 'Unknown Department'
        if (!acc[deptName]) acc[deptName] = []
        acc[deptName].push(device)
        return acc
      }, {})

      const transformedDepartments = await Promise.all(
        departments.map(async (dept) => {
          const deptDevices = devicesByDept[dept.departmentName] || []
          const machinesWithMetrics = await Promise.all(
            deptDevices.map(async (device) => {
              let machineData = buildMachineRecord(device, null, custId)

              if (fetchMachineMetrics) {
                try {
                  const metrics = await fetchMachineDetails(custId, device.deviceId)
                  machineData = buildMachineRecord(device, metrics, custId)
                } catch (error) {
                  console.error(`Failed to fetch metrics for device ${device.deviceId}:`, error?.message || error)
                }
              }

              return machineData
            }),
          )

          return {
            id: `${custId}-${dept.departmentName}`,
            name: dept.departmentName,
            custId: dept.custId,
            zones: [
              {
                id: `${custId}-${dept.departmentName}-default-zone`,
                name: 'Main Zone',
                machines: machinesWithMetrics,
              },
            ],
            shiftData: dept.shiftData || [],
          }
        }),
      )

      return {
        id: custId,
        name: customer.name,
        email: customer.email,
        plant: customer.plant,
        noOfMachines: customer.noOfMachines,
        timeZone: customer.timeZone,
        departments: transformedDepartments,
        status: customer.status,
        updatedAt: new Date().toISOString(),
      }
    }),
  )
}

export async function fetchCustomerHierarchy(fetchMachineMetrics = false) {
  const customers = await fetchCustomers()
  return transformCustomerData(customers, fetchMachineMetrics)
}

export async function fetchDepartmentHourlyOEE(
  custId,
  date,
  department,
  shiftName,
) {
  const response = await axios.get(
    `${CLIENT_API_BASE_URL}/department/depthourlyoee`,
    {
      params: { custId, date, department, shiftName },
      headers: {
        Authorization: `Bearer ${CLIENT_API_TOKEN}`,
        'Content-Type': 'application/json',
      },
    },
  )

  return normalizeApiPayload(response.data)
}
