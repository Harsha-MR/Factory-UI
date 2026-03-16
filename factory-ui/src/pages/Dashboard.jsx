import { useEffect, useMemo, useRef, useState } from "react";
import { useLocation, useNavigate, useSearchParams } from "react-router-dom";
import {
  getDepartmentsByPlant,
  getFactories,
  getPlantsByFactory,
} from "../services/mockApi";

import { DepartmentZoneTickerCard, Select } from "../components/dashboard";

export default function Dashboard() {
  const navigate = useNavigate();
  const location = useLocation();
  const [searchParams] = useSearchParams();

  const departmentsRef = useRef(null);

  const [factories, setFactories] = useState([]);
  const [plants, setPlants] = useState([]);
  const [departments, setDepartments] = useState([]);
  const [departmentsFetchedAt, setDepartmentsFetchedAt] = useState("");

  const [factoryId, setFactoryId] = useState(
    () => searchParams.get("factoryId") || "",
  );
  const [plantId, setPlantId] = useState(
    () => searchParams.get("plantId") || "",
  );
  const [showDepartments, setShowDepartments] = useState(
    () => searchParams.get("show") === "1",
  );
  const [selectedDepartmentId, setSelectedDepartmentId] = useState("");

  const [loadingFactories, setLoadingFactories] = useState(false);
  const [loadingPlants, setLoadingPlants] = useState(false);
  const [loadingDepartments, setLoadingDepartments] = useState(false);
  const [error, setError] = useState("");

  const selectedPlantName = useMemo(() => {
    const p = plants.find((x) => x.id === plantId);
    return p?.name || "";
  }, [plants, plantId]);

  // Removed auto-focus on departments section.

  // If the user lands/navigates to a URL with query params, reflect them in state.
  // This ensures browser back/forward or manual URL navigation restores the expected view.
  useEffect(() => {
    const desiredFactoryId = searchParams.get("factoryId") || "";
    const desiredPlantId = searchParams.get("plantId") || "";
    const desiredShowDepartments = searchParams.get("show") === "1";

    if (desiredFactoryId && desiredFactoryId !== factoryId)
      setFactoryId(desiredFactoryId);
    if (desiredPlantId && desiredPlantId !== plantId)
      setPlantId(desiredPlantId);
    if (desiredShowDepartments !== showDepartments)
      setShowDepartments(desiredShowDepartments);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams]);

  useEffect(() => {
    let cancelled = false;

    (async () => {
      try {
        setError("");
        setLoadingFactories(true);
        const data = await getFactories();
        if (!cancelled) {
          setFactories(data);
        }
      } catch (e) {
        if (!cancelled) setError(e?.message || "Failed to load factories");
      } finally {
        if (!cancelled) setLoadingFactories(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;

    setPlantId("");
    setPlants([]);
    setDepartments([]);
    setDepartmentsFetchedAt("");
    setSelectedDepartmentId("");
    setShowDepartments(false);

    if (!factoryId) return undefined;

    (async () => {
      try {
        setError("");
        setLoadingPlants(true);
        const data = await getPlantsByFactory(factoryId);
        if (!cancelled) {
          setPlants(data);
        }
      } catch (e) {
        if (!cancelled) setError(e?.message || "Failed to load plants");
      } finally {
        if (!cancelled) setLoadingPlants(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [factoryId]);

  useEffect(() => {
    let cancelled = false;

    setDepartments([]);
    setDepartmentsFetchedAt("");
    setSelectedDepartmentId("");
    setShowDepartments(false);

    if (!plantId) return undefined;

    (async () => {
      try {
        setError("");
        setLoadingDepartments(true);
        const data = await getDepartmentsByPlant(plantId);
        if (!cancelled) {
          setDepartments(data);
          setDepartmentsFetchedAt(new Date().toISOString());
          if (data.length > 0) {
            setShowDepartments(true);
          }
        }
      } catch (e) {
        if (!cancelled) setError(e?.message || "Failed to load departments");
      } finally {
        if (!cancelled) setLoadingDepartments(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [plantId]);

  // Only navigate to selected department's non-fullscreen canvas on Get
  function onGet() {
    if (!factoryId || !plantId) return;
    setError("");
    if (departments.length === 0) {
      setShowDepartments(true);
      setError("No departments available");
      return;
    }
    const selectedDepartment = departments.find(
      (d) => d.id === selectedDepartmentId,
    );
    if (!selectedDepartment?.id) {
      setShowDepartments(true);
      setError("Select a department");
      return;
    }
    navigate(`/departments/${selectedDepartment.id}/layout-3d`);
  }

  function openMachineFromTicker(dept, machine) {
    if (!dept?.id || !machine?.id) return;

    navigate(`/departments/${dept.id}/machines/${machine.id}`, {
      state: {
        backgroundLocation: location,
        machine,
        context: { department: dept.name, plant: selectedPlantName },
        fetchedAt: departmentsFetchedAt,
      },
    });
  }

  return (
    <div className="space-y-3">
      <div>
        <h1 className="text-xl font-semibold text-white m-0 leading-none pt-2">
          Dashboard
        </h1>
      </div>

      <div className="rounded border bg-white p-4">
        <div className="grid grid-cols-1 gap-3 sm:gap-4 md:grid-cols-4 md:items-end">
          <Select
            label="Factory"
            value={factoryId}
            onChange={setFactoryId}
            options={factories}
            disabled={loadingFactories}
          />
          <Select
            label="Plant"
            value={plantId}
            onChange={setPlantId}
            options={plants}
            disabled={!factoryId || loadingPlants}
          />

          <Select
            label="Department"
            value={selectedDepartmentId}
            onChange={setSelectedDepartmentId}
            options={departments}
            disabled={!plantId || loadingDepartments || departments.length === 0}
          />

          <div className="flex flex-col">
            <div className="mb-1 text-sm font-medium text-gray-700 opacity-0">
              Action
            </div>
            <button
              className="inline-flex w-fit rounded bg-black px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
              onClick={onGet}
              disabled={!plantId || loadingPlants || loadingDepartments}
            >
              Get
            </button>
          </div>
        </div>

        {error ? (
          <div className="mt-3 text-sm text-red-600">{error}</div>
        ) : null}
      </div>

      {showDepartments ? (
        <div
          ref={departmentsRef}
          className="space-y-3 rounded border bg-white p-4"
        >
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <div className="text-lg font-semibold">Departments</div>
              <div className="text-xs text-gray-500">
                Select a department to view the floor layout.
              </div>
            </div>
          </div>

          {departments.length === 0 ? (
            <div className="rounded border bg-gray-50 p-3 text-sm text-gray-600">
              No departments found for the selected plant.
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {departments.map((d) => (
                <DepartmentZoneTickerCard
                  key={d.id}
                  name={d.name}
                  summary={d.summary}
                  id={d.id}
                  machines={d.machines}
                  zones={d.zones}
                  bodyMaxHeightClass="max-h-[320px]"
                  onClick={() =>
                    navigate(`/departments/${d.id}/layout-3d`, {
                      state: {
                        fromDashboard: {
                          factoryId,
                          plantId,
                          show: showDepartments ? "1" : "0",
                        },
                        plantName: selectedPlantName,
                        departmentsFetchedAt,
                      },
                    })
                  }
                  onMachineClick={(m) => openMachineFromTicker(d, m)}
                />
              ))}
            </div>
          )}
        </div>
      ) : null}
    </div>
  );
}
