'use client';

import {
  useState,
} from 'react';

import {
  useRouter,
} from 'next/navigation';


type CatalogModel = {
  id:
    string;

  provider:
    string;
};


type CatalogResponse = {
  available?:
    boolean;

  models?:
    CatalogModel[];

  error?:
    string;
};


type AssignmentResponse = {
  ok?:
    boolean;

  changed?:
    boolean;

  agent?: {
    id:
      string;

    model:
      string;
  };

  error?:
    string;
};


export function AgentModelSelect({
  agentId,
  currentModel,
}: {
  agentId:
    string;

  currentModel:
    string;
}) {
  const router =
    useRouter();


  const initialModel =
    currentModel &&
    currentModel !==
      'unassigned'
      ? currentModel
      : '';


  const [
    assignedModel,
    setAssignedModel,
  ] =
    useState(
      initialModel,
    );


  const [
    selectedModel,
    setSelectedModel,
  ] =
    useState(
      initialModel,
    );


  const [
    models,
    setModels,
  ] =
    useState<
      CatalogModel[] |
      null
    >(
      null,
    );


  const [
    loading,
    setLoading,
  ] =
    useState(
      false,
    );


  const [
    saving,
    setSaving,
  ] =
    useState(
      false,
    );


  const [
    error,
    setError,
  ] =
    useState<
      string |
      null
    >(
      null,
    );


  const loadModels =
    async () => {
      if (
        models ||
        loading
      ) {
        return;
      }


      setLoading(
        true,
      );

      setError(
        null,
      );


      try {
        const response =
          await fetch(
            '/api/models/omniroute',
            {
              cache:
                'no-store',
            },
          );


        const body =
          await response
            .json() as
            CatalogResponse;


        if (
          !response.ok ||
          body.available ===
            false
        ) {
          throw new Error(
            body.error ??
            'omniroute_unavailable',
          );
        }


        setModels(
          body.models ??
          [],
        );
      } catch (
        e
      ) {
        setError(
          e instanceof
            Error
            ? e.message
            : 'omniroute_unavailable',
        );
      } finally {
        setLoading(
          false,
        );
      }
    };


  const assign =
    async () => {
      if (
        !selectedModel ||
        selectedModel ===
          assignedModel
      ) {
        return;
      }


      setSaving(
        true,
      );

      setError(
        null,
      );


      try {
        const response =
          await fetch(
            `/api/agents/${encodeURIComponent(
              agentId,
            )}/model`,
            {
              method:
                'POST',

              headers: {
                'Content-Type':
                  'application/json',
              },

              body:
                JSON.stringify({
                  model:
                    selectedModel,
                }),
            },
          );


        const body =
          await response
            .json() as
            AssignmentResponse;


        if (
          !response.ok ||
          !body.ok ||
          !body.agent
        ) {
          throw new Error(
            body.error ??
            'model_assignment_failed',
          );
        }


        const savedModel =
          body.agent.model;


        setAssignedModel(
          savedModel,
        );

        setSelectedModel(
          savedModel,
        );


        router.refresh();
      } catch (
        e
      ) {
        setError(
          e instanceof
            Error
            ? e.message
            : 'model_assignment_failed',
        );
      } finally {
        setSaving(
          false,
        );
      }
    };


  const currentMissingFromCatalog =
    Boolean(
      assignedModel &&
      (
        !models ||
        !models.some(
          (
            model,
          ) =>
            model.id ===
            assignedModel,
        )
      ),
    );


  return (
    <div className="min-w-0 flex-1">
      <div className="flex items-center gap-2">
        <select
          value={
            selectedModel
          }
          disabled={
            saving
          }
          onFocus={
            () =>
              void loadModels()
          }
          onChange={
            (
              event,
            ) =>
              setSelectedModel(
                event.target.value,
              )
          }
          className="min-w-0 flex-1 rounded-md border border-os-border bg-os-surface2 px-2 py-1.5 font-mono text-[10px] text-os-muted focus:border-os-border-strong focus:outline-none disabled:opacity-50"
        >
          <option value="">
            Not assigned
          </option>

          {loading && (
            <option disabled>
              Loading OmniRoute…
            </option>
          )}

          {currentMissingFromCatalog && (
            <option
              value={
                assignedModel
              }
            >
              {assignedModel} (current)
            </option>
          )}

          {models?.map(
            (
              model,
            ) => (
              <option
                key={
                  model.id
                }
                value={
                  model.id
                }
              >
                {model.id}
              </option>
            ),
          )}
        </select>

        <button
          type="button"
          disabled={
            saving ||
            !selectedModel ||
            selectedModel ===
              assignedModel
          }
          onClick={
            () =>
              void assign()
          }
          className="rounded-md border border-os-border-strong px-2.5 py-1.5 font-mono text-[9.5px] uppercase tracking-[0.08em] text-os-muted transition-colors hover:bg-os-text hover:text-os-bg disabled:cursor-not-allowed disabled:opacity-30"
        >
          {saving
            ? 'Saving…'
            : 'Assign'}
        </button>
      </div>

      <div className="mt-1 truncate font-mono text-[9px] text-os-dim">
        Current:{' '}
        {assignedModel ||
          'Not assigned'}
      </div>

      {error && (
        <div className="mt-1 font-mono text-[9px] text-os-err">
          {error}
        </div>
      )}
    </div>
  );
}