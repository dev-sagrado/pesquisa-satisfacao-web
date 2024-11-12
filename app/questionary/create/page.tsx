/* eslint-disable no-case-declarations */
'use client'

import { useReducer, useCallback, useState } from 'react'
import {
  DragDropContext,
  Droppable,
  Draggable,
  DropResult,
} from 'react-beautiful-dnd'
import {
  Undo2,
  Redo2,
  Send,
  Plus,
  Copy,
  Trash2,
  GripVertical,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group'
import { Label } from '@/components/ui/label'
import { useToast } from '@/hooks/use-toast'
import { Question, Questionary, QuestionType } from '@/interfaces/questionary'
import { FormAction, HistoryState } from '@/interfaces/question'
import Cookies from 'js-cookie'
import axios from 'axios'
import LoadingSpinner from '@/components/loadingSpinner'

const initialState: HistoryState = {
  past: [],
  present: {
    id: Date.now(),
    title: 'Questionário sem nome',
    options: {
      startDate: new Date(),
      endDate: new Date(new Date().setFullYear(new Date().getFullYear() + 1)),
      answersLimit: 100,
      anonymous: true,
    },
    questions: [
      {
        id: 1,
        text: 'Questão',
        type: QuestionType.MULTIPLE_CHOICE,
        statistics: {},
      },
    ],
  },
  future: [],
}

function formReducer(state: HistoryState, action: FormAction): HistoryState {
  const updateHistory = (newPresent: Questionary): HistoryState => ({
    past: [...state.past, state.present],
    present: newPresent,
    future: [],
  })

  switch (action.type) {
    case 'SET_TITLE':
      return updateHistory({ ...state.present, title: action.payload })
    case 'ADD_QUESTION':
      return updateHistory({
        ...state.present,
        questions: [
          ...state.present.questions,
          {
            id: state.present.questions.length + 1,
            text: 'Nova Questão',
            type: QuestionType.MULTIPLE_CHOICE,
            statistics: {},
            options: [],
          },
        ],
      })
    case 'UPDATE_QUESTION_TITLE':
      return updateHistory({
        ...state.present,
        questions: state.present.questions.map((q) =>
          q.id === action.payload.id ? { ...q, text: action.payload.title } : q,
        ),
      })
    case 'UPDATE_QUESTION_TYPE':
      return updateHistory({
        ...state.present,
        questions: state.present.questions.map((q) => {
          if (q.id === action.payload.id) {
            return {
              ...q,
              type: action.payload.questionType,
              statistics: {},
              options:
                action.payload.questionType === QuestionType.MULTIPLE_CHOICE
                  ? q.options || []
                  : undefined,
            }
          }
          return q
        }),
      })
    case 'ADD_OPTION':
      return updateHistory({
        ...state.present,
        questions: state.present.questions.map((q) => {
          if (
            q.id === action.payload &&
            q.type === QuestionType.MULTIPLE_CHOICE
          ) {
            return {
              ...q,
              options: [...(q.options || []), ''],
            }
          }
          return q
        }),
      })
    case 'UPDATE_OPTION':
      return updateHistory({
        ...state.present,
        questions: state.present.questions.map((q) => {
          if (q.id === action.payload.id && q.options) {
            return {
              ...q,
              options: q.options.map((opt, index) =>
                index === action.payload.optionIndex
                  ? action.payload.value
                  : opt,
              ),
            }
          }
          return q
        }),
      })
    case 'REMOVE_QUESTION':
      return updateHistory({
        ...state.present,
        questions: state.present.questions.filter(
          (q) => q.id !== action.payload,
        ),
      })
    case 'CLONE_QUESTION':
      return updateHistory({
        ...state.present,
        questions: state.present.questions.reduce<Question[]>((acc, q) => {
          acc.push(q)
          if (q.id === action.payload) {
            const newQuestion: Question = {
              ...q,
              id: state.present.questions.length + 1,
              text: `Cópia de ${q.text}`,
              options: q.options ? [...q.options] : undefined,
            }
            acc.push(newQuestion)
          }
          return acc
        }, []),
      })
    case 'REORDER_QUESTIONS':
      return updateHistory({
        ...state.present,
        questions: [...action.payload],
      })
    case 'UNDO':
      if (state.past.length === 0) return state
      // eslint-disable-next-line no-case-declarations
      const previous = state.past[state.past.length - 1]
      const newPast = state.past.slice(0, state.past.length - 1)
      return {
        past: newPast,
        present: previous,
        future: [state.present, ...state.future],
      }
    case 'REDO':
      if (state.future.length === 0) return state
      const next = state.future[0]
      const newFuture = state.future.slice(1)
      return {
        past: [...state.past, state.present],
        present: next,
        future: newFuture,
      }
    default:
      return state
  }
}

export default function Component() {
  const [state, dispatch] = useReducer(formReducer, initialState)
  const { toast } = useToast()
  const [loading, setLoading] = useState(false)

  const onDragEnd = useCallback(
    (result: DropResult) => {
      if (!result.destination) return

      const items = Array.from(state.present.questions)
      const [reorderedItem] = items.splice(result.source.index, 1)
      items.splice(result.destination.index, 0, reorderedItem)

      dispatch({ type: 'REORDER_QUESTIONS', payload: items })
    },
    [state.present.questions],
  )

  const handleCreateForm = async () => {
    setLoading(true)

    try {
      const token = Cookies.get('token')

      if (!token) {
        throw new Error('Token não encontrado')
      }

      const requestBody = {
        id: state.present.id,
        title: state.present.title,
        createdAt: new Date().toISOString(),
        options: {
          startDate: state.present.options.startDate,
          endDate: state.present.options.endDate,
          answersLimit: state.present.options.answersLimit,
          anonymous: state.present.options.anonymous || true,
        },
        questions: state.present.questions.map((q) => ({
          id: q.id,
          text: q.text,
          type: q.type,
          statistics: q.statistics || null,
          options: q.options || null,
        })),
      }

      await axios.post('/questionary/create', requestBody, {
        headers: {
          Authorization: `Bearer ${token}`,
          'Access-Control-Allow-Origin': '*',
        },
      })

      toast({
        title: 'Success',
        description: 'Formulário criado com sucesso',
      })
    } catch (error) {
      console.error('Ocorreu um erro inesperado ao criar o questionário', error)
      toast({
        title: 'Erro',
        description: 'Ocorreu um erro inesperado ao criar o questionário',
      })
    } finally {
      setLoading(false)
    }
  }

  return (
    <>
      <LoadingSpinner isLoading={loading} />
      <div className="min-h-screen bg-gray-100">
        <div className="bg-white shadow">
          <div className="container mx-auto px-4 py-2 flex justify-between items-center gap-4">
            <div className="flex items-center gap-4">
              <Button
                size="icon"
                variant="ghost"
                onClick={() => dispatch({ type: 'UNDO' })}
                disabled={state.past.length === 0}
              >
                <Undo2 className="w-5 h-5 text-gray-500" />
              </Button>
              <Button
                size="icon"
                variant="ghost"
                onClick={() => dispatch({ type: 'REDO' })}
                disabled={state.future.length === 0}
              >
                <Redo2 className="w-5 h-5 text-gray-500" />
              </Button>
            </div>
            <Input
              value={state.present.title}
              onChange={(e) => {
                console.log(`QUESTIONARY TITLE: ${state.present.title}`)
                dispatch({ type: 'SET_TITLE', payload: e.target.value })
              }}
              className="text-xl font-semibold text-center border-none shadow-none"
            />
            <Button
              onClick={handleCreateForm}
              className="bg-green-500 hover:bg-green-600 text-white"
            >
              <Send className="w-5 h-5" />
            </Button>
          </div>
        </div>

        <div className="container mx-auto px-4 py-8">
          <div className="bg-white rounded-lg shadow-md p-6 mb-6">
            <DragDropContext onDragEnd={onDragEnd}>
              <Droppable droppableId="questions">
                {(provided) => (
                  <div {...provided.droppableProps} ref={provided.innerRef}>
                    {state.present.questions &&
                    state.present.questions.length > 0 ? (
                      state.present.questions.map((question, index) => (
                        <Draggable
                          key={question.id}
                          draggableId={String(question.id)}
                          index={index}
                        >
                          {(provided) => (
                            <div
                              ref={provided.innerRef}
                              {...provided.draggableProps}
                              className="mb-6 p-4 border rounded-lg relative bg-white"
                            >
                              <div className="grid grid-cols-[1fr,auto,auto,auto,auto] gap-2 items-center mb-4">
                                <Input
                                  value={question.text}
                                  onChange={(e) => {
                                    dispatch({
                                      type: 'UPDATE_QUESTION_TITLE',
                                      payload: {
                                        id: question.id,
                                        title: e.target.value,
                                      },
                                    })
                                  }}
                                  className="text-lg font-semibold"
                                />
                                <Select
                                  defaultValue={question.type}
                                  onValueChange={(value) => {
                                    dispatch({
                                      type: 'UPDATE_QUESTION_TYPE',
                                      payload: {
                                        id: question.id,
                                        questionType: value,
                                      },
                                    })
                                  }}
                                >
                                  <SelectTrigger className="w-[180px]">
                                    <SelectValue placeholder="Tipo Pergunta" />
                                  </SelectTrigger>
                                  <SelectContent>
                                    <SelectItem value="MULTIPLE_CHOICE">
                                      Múltipla Escolha
                                    </SelectItem>
                                    <SelectItem value="TEXT">Texto</SelectItem>
                                    <SelectItem value="BOOLEAN">
                                      Sim e Não
                                    </SelectItem>
                                  </SelectContent>
                                </Select>
                                <Button
                                  onClick={() =>
                                    dispatch({
                                      type: 'CLONE_QUESTION',
                                      payload: question.id,
                                    })
                                  }
                                  size="icon"
                                  variant="ghost"
                                >
                                  <Copy className="w-5 h-5 text-gray-400" />
                                </Button>
                                <Button
                                  onClick={() =>
                                    dispatch({
                                      type: 'REMOVE_QUESTION',
                                      payload: question.id,
                                    })
                                  }
                                  size="icon"
                                  variant="ghost"
                                >
                                  <Trash2 className="w-5 h-5 text-gray-400" />
                                </Button>
                                <div {...provided.dragHandleProps}>
                                  <GripVertical className="w-5 h-5 text-gray-400 cursor-move" />
                                </div>
                              </div>

                              {question.type === QuestionType.MULTIPLE_CHOICE &&
                                (question.options || []).map(
                                  (option, optionIndex) => (
                                    <div
                                      key={optionIndex}
                                      className="flex items-center mb-2"
                                    >
                                      <div className="w-4 h-4 rounded-full border border-gray-300 mr-2"></div>
                                      <Input
                                        value={option}
                                        onChange={(e) =>
                                          dispatch({
                                            type: 'UPDATE_OPTION',
                                            payload: {
                                              id: question.id,
                                              optionIndex,
                                              value: e.target.value,
                                            },
                                          })
                                        }
                                        className="flex-grow"
                                      />
                                    </div>
                                  ),
                                )}

                              {question.type === QuestionType.TEXT && (
                                <Textarea
                                  placeholder="Campo de texto"
                                  className="w-full mt-2 resize-none"
                                />
                              )}

                              {question.type === QuestionType.BOOLEAN && (
                                <RadioGroup className="mt-2">
                                  <div className="flex items-center space-x-2">
                                    <RadioGroupItem
                                      value="yes"
                                      id={`${question.id}-yes`}
                                    />
                                    <Label htmlFor={`${question.id}-yes`}>
                                      Sim
                                    </Label>
                                  </div>
                                  <div className="flex items-center space-x-2">
                                    <RadioGroupItem
                                      value="no"
                                      id={`${question.id}-no`}
                                    />
                                    <Label htmlFor={`${question.id}-no`}>
                                      Não
                                    </Label>
                                  </div>
                                </RadioGroup>
                              )}

                              {question.type ===
                                QuestionType.MULTIPLE_CHOICE && (
                                <Button
                                  onClick={() =>
                                    dispatch({
                                      type: 'ADD_OPTION',
                                      payload: question.id,
                                    })
                                  }
                                  variant="outline"
                                  size="sm"
                                  className="mt-2"
                                >
                                  Adicionar Opção
                                </Button>
                              )}
                            </div>
                          )}
                        </Draggable>
                      ))
                    ) : (
                      <div>No questions available</div>
                    )}
                    {provided.placeholder}
                  </div>
                )}
              </Droppable>
            </DragDropContext>
          </div>

          <div className="fixed right-8 bottom-8 bg-white rounded-full shadow-lg p-4">
            <Button
              onClick={() => dispatch({ type: 'ADD_QUESTION' })}
              size="icon"
              variant="ghost"
              className="rounded-full"
            >
              <Plus className="h-6 w-6" />
            </Button>
          </div>
        </div>
      </div>
    </>
  )
}