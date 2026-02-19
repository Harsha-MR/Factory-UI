import axios from 'axios'

const PART_COUNT_API_URL = import.meta.env.VITE_PART_COUNT_API_URL;
const PART_COUNT_API_KEY = import.meta.env.VITE_PART_COUNT_API_KEY;

/**
 * Fetch hourly part count data for a specific machine
 * @param {string} custID - Customer ID
 * @param {string} deviceID - Device/Machine ID
 * @param {string[]} dates - Array of dates (e.g., ["2026-02-17", "2026-02-16", "2026-02-15"])
 * @returns {Promise<Object>} Hourly part count data
 */
export async function fetchHourlyPartCount(custID, deviceID, dates) {
  try {
    const payload = {
      custID,
      deviceID,
      date: dates
    }
    
    console.log('📊 Fetching hourly part count with payload:', payload)
    
    const response = await axios.post(
      PART_COUNT_API_URL,
      payload,
      {
        headers: {
          'x-functions-key': PART_COUNT_API_KEY,
          'Content-Type': 'application/json'
        }
      }
    )
    
    console.log('✅ Hourly part count response:', response.data)
    
    // Return the first entry (today's data)
    const todayData = response.data?.data?.[0] || null
    console.log('📈 Using today\'s data:', todayData)
    
    return todayData
  } catch (error) {
    console.error('❌ Error fetching hourly part count:', error)
    throw error
  }
}

/**
 * Generate date array for the last N days
 * @param {number} days - Number of days to include
 * @returns {string[]} Array of date strings in YYYY-MM-DD format
 */
export function getLastNDates(days = 3) {
  const dates = []
  
  for (let i = 0; i < days; i++) {
    const date = new Date()
    date.setDate(date.getDate() - i)
    
    // Format as YYYY-MM-DD using local timezone
    const year = date.getFullYear()
    const month = String(date.getMonth() + 1).padStart(2, '0')
    const day = String(date.getDate()).padStart(2, '0')
    dates.push(`${year}-${month}-${day}`)
  }
  
  console.log('📅 Generated dates:', dates)
  return dates
}
