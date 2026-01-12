import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const STATUSES = ['RUNNING', 'WARNING', 'DOWN', 'OFFLINE', 'MAINTENANCE']

function randomIntInclusive(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min
}

function pick(arr, index) {
  return arr[index % arr.length]
}

function generateHierarchy({
  factoryCount = 2,
  plantsPerFactory = 3,
  departmentsPerPlant = 4,
  zonesPerDepartment = 6,
  minMachinesPerZone = 1,
  maxMachinesPerZone = 5,
} = {}) {
  let plantSeq = 1
  let departmentSeq = 1
  let zoneSeq = 1
  let machineSeq = 1

  const factoryNames = [
    'Northwind Automotive Components - Detroit',
    'Contoso Precision Manufacturing - Austin',
  ]

  const plantNames = [
    'Machining & Assembly',
    'Surface Treatment & Coating',
    'Final Assembly & Test',
  ]

  const departmentNames = [
    'Machining',
    'Assembly',
    'Quality',
    'Packaging & Dispatch',
  ]

  const zoneNamePrefixes = [
    'Line',
    'Cell',
    'Station',
    'Bay',
    'Area',
    'Buffer',
  ]

  const machineNamePrefixes = [
    'CNC',
    'Robot',
    'Press',
    'Conveyor',
    'Oven',
    'Pump',
    'Compressor',
    'Welder',
    'Laser',
    'TestRig',
  ]

  const factories = []

  for (let f = 1; f <= factoryCount; f++) {
    const factory = {
      id: `f${f}`,
      name: pick(factoryNames, f - 1),
      plants: [],
    }

    for (let pi = 0; pi < plantsPerFactory; pi++) {
      const plant = {
        id: `p${plantSeq++}`,
        name: `Plant ${String.fromCharCode(65 + pi)} - ${pick(plantNames, pi)}`,
        departments: [],
      }

      for (let di = 0; di < departmentsPerPlant; di++) {
        const department = {
          id: `d${departmentSeq++}`,
          name: `${pick(departmentNames, di)}`,
          layout: {
            zones: [],
          },
        }

        for (let zi = 0; zi < zonesPerDepartment; zi++) {
          const zone = {
            id: `z${zoneSeq++}`,
            name: `${pick(zoneNamePrefixes, zi)} ${zi + 1}`,
            machines: [],
          }

          const machineCount = randomIntInclusive(
            minMachinesPerZone,
            maxMachinesPerZone,
          )

          for (let mi = 0; mi < machineCount; mi++) {
            const status = pick(STATUSES, randomIntInclusive(0, STATUSES.length - 1))
            zone.machines.push({
              id: `m${machineSeq++}`,
              name: `${pick(machineNamePrefixes, machineSeq)}-${String(machineSeq).padStart(3, '0')}`,
              status,
            })
          }

          department.layout.zones.push(zone)
        }

        plant.departments.push(department)
      }

      factory.plants.push(plant)
    }

    factories.push(factory)
  }

  return { factories }
}

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

const repoRoot = path.resolve(__dirname, '..')
const outPath = path.join(repoRoot, 'src', 'mock', 'factoryHierarchy.json')

const data = generateHierarchy({
  factoryCount: 2,
  plantsPerFactory: 3,
  departmentsPerPlant: 4,
  zonesPerDepartment: 6,
  minMachinesPerZone: 1,
  maxMachinesPerZone: 5,
})

fs.writeFileSync(outPath, JSON.stringify(data, null, 2) + '\n', 'utf8')
console.log(`Wrote ${outPath}`)
